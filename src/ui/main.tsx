import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import { createEntry, deleteEntry, getSummary, subscribeToChanges, updateEntry } from "./api.js";
import { isCommentLine, normalizeCommandBody } from "../core/commandRules.js";
import { formatNoteBody, inferTitle, organizeDrafts, organizeNoteDraft } from "../core/organizer.js";
import { findSecrets, redactSecrets } from "../core/secretScanner.js";
import type { Entry, Summary } from "../core/types.js";
import "./styles.css";

type View = "capture" | "commands" | "notes";

const emptySummary: Summary = { entries: [], tags: [] };

function App() {
  const [view, setView] = useState<View>("commands");
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [notice, setNotice] = useState("");

  async function refresh() {
    setSummary(await getSummary());
  }

  useEffect(() => {
    refresh().catch((error) => setNotice(error.message));
    return subscribeToChanges(() => {
      refresh().catch((error) => setNotice(error.message));
    });
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">kb</span>
          <div>
            <strong>Commands</strong>
            <small>Cloud-synced command snippets</small>
          </div>
        </div>
        <nav>
          {(["commands", "notes", "capture"] as View[]).map((item) => (
            <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)}>
              {labelView(item)}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>{summary.entries.filter((entry) => entry.type === "command").length}</span> commands
          <span>{summary.entries.filter((entry) => entry.type === "note").length}</span> notes
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Synced live across devices</p>
            <h1>{labelView(view)}</h1>
          </div>
          <button className="ghost" onClick={() => refresh().then(() => setNotice("Refreshed"))}>Refresh</button>
        </header>

        {view === "capture" && <CaptureWorkspace summary={summary} onSaved={refresh} setNotice={setNotice} />}
        {view === "commands" && <Commands summary={summary} onSaved={refresh} setNotice={setNotice} />}
        {view === "notes" && <Notes summary={summary} onSaved={refresh} setNotice={setNotice} />}
      </section>

      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

function CaptureWorkspace({ summary, onSaved, setNotice, compact }: { summary: Summary; onSaved: () => Promise<void>; setNotice: (value: string) => void; compact?: boolean }) {
  const [rawInput, setRawInput] = useState("");
  const [splitEnabled, setSplitEnabled] = useState(true);
  const [bodyOverride, setBodyOverride] = useState<string | null>(null);
  const [tagsOverride, setTagsOverride] = useState<string[] | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [annotationOverride, setAnnotationOverride] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const drafts = useMemo(
    () => organizeDrafts({ body: rawInput, tags: summary.tags, entries: summary.entries, split: splitEnabled }),
    [rawInput, summary.tags, summary.entries, splitEnabled]
  );
  const single = drafts.length === 1;
  const draft = drafts[0];
  const body = single ? bodyOverride ?? draft.body : draft.body;
  const title = single ? inferTitle(body) : draft.title;
  const tags = single ? tagsOverride ?? draft.tags : draft.tags;
  const annotation = single ? annotationOverride ?? draft.annotation : draft.annotation;
  const duplicateOf = single ? findDuplicate(body, summary.entries) : undefined;
  const secretFindings = single ? findSecrets(`${title}\n${body}\n${annotation}`) : [];
  const expanded = !compact || rawInput.trim().length > 0;

  function resetCapture() {
    setRawInput("");
    setBodyOverride(null);
    setTagsOverride(null);
    setTagDraft("");
    setAnnotationOverride(null);
    setError("");
  }

  function redactSensitiveInfo() {
    setBodyOverride(redactSecrets(body));
    setAnnotationOverride(redactSecrets(annotation));
  }

  async function save() {
    if (savingRef.current) {
      return;
    }
    if (!rawInput.trim()) {
      setError("Paste or type a command before saving.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const toSave = single
        ? [{ title, body, annotation }]
        : drafts.map((item) => ({ title: item.title, body: item.body, annotation: item.annotation }));

      const concerns: string[] = [];
      const seenInBatch = new Set<string>();
      for (const item of toSave) {
        const label = item.body.split("\n")[0];
        const normalized = normalizeCommandBody(item.body);
        const existing = findDuplicate(item.body, summary.entries);
        if (existing) {
          concerns.push(`"${label}" looks like a duplicate of an existing command ("${existing.title}")`);
        } else if (seenInBatch.has(normalized)) {
          concerns.push(`"${label}" appears more than once in this paste`);
        }
        seenInBatch.add(normalized);

        const secretFindings = findSecrets(`${item.title}\n${item.body}\n${item.annotation}`);
        if (secretFindings.length) {
          concerns.push(`"${label}" may contain sensitive information (${secretFindings.join(", ")})`);
        }
      }
      if (concerns.length && !window.confirm(`Before saving:\n\n${concerns.join("\n")}\n\nSave anyway?`)) {
        return;
      }
      if (single) {
        await createEntry({ title, type: "command", body, annotation, tags });
        setNotice("Command saved");
      } else {
        for (const item of drafts) {
          await createEntry({ title: item.title, type: "command", body: item.body, annotation: item.annotation, tags: mergeTags(item.tags, tagsOverride ?? []) });
        }
        setNotice(`Saved ${drafts.length} commands`);
      }
      resetCapture();
      await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className={compact ? "capture-workspace compact" : "capture-workspace"}>
      <textarea
        autoFocus={!compact}
        className={compact ? "capture-input compact" : "capture-input"}
        value={rawInput}
        onChange={(event) => {
          setRawInput(event.target.value);
          setBodyOverride(null);
          setTagsOverride(null);
          setTagDraft("");
          setAnnotationOverride(null);
          setError("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            save();
          }
        }}
        placeholder={
          compact
            ? "Add a command... (Enter to save, Shift+Enter for a new line)"
            : "Paste one or more commands. Use # / -- / // for your own comments.\nEnter to save, Shift+Enter for a new line."
        }
      />
      {error && <p className="error inline-error">{error}</p>}
      {expanded && (
      <label className="split-toggle">
        <input type="checkbox" checked={splitEnabled} onChange={(event) => setSplitEnabled(event.target.checked)} />
        Split multiple commands into separate entries
      </label>
      )}

      {expanded && (single ? (
        <div className="panel detail-editor">
          {duplicateOf && <p className="duplicate-warning">Looks like a duplicate of "{duplicateOf.title}"</p>}
          {secretFindings.length > 0 && (
            <p className="secret-warning">
              May contain sensitive information ({secretFindings.join(", ")})
              <button type="button" className="ghost" onClick={redactSensitiveInfo}>Redact sensitive info</button>
            </p>
          )}
          <textarea
            className="annotation-input"
            value={annotation}
            onChange={(event) => setAnnotationOverride(event.target.value)}
            placeholder="What does this do? (auto-filled from your comment, or a guess when recognized)"
          />
          <div className="row">
            <textarea
              className="command-body command-body-preview"
              value={body}
              onChange={(event) => setBodyOverride(event.target.value)}
              spellCheck={false}
            />
            <TagInput tags={tags} draftValue={tagDraft} onDraftChange={setTagDraft} onChange={setTagsOverride} />
          </div>
        </div>
      ) : (
        <div className="panel detail-editor">
          <p className="muted">{drafts.length} commands detected — each will be saved as its own entry.</p>
          <TagInput tags={tagsOverride ?? []} draftValue={tagDraft} onDraftChange={setTagDraft} onChange={setTagsOverride} />
          <div className="draft-preview-list">
            {drafts.map((item, index) => {
              const dup = findDuplicate(item.body, summary.entries);
              const itemTags = mergeTags(item.tags, tagsOverride ?? []);
              return (
                <div className="draft-preview" key={index}>
                  {dup && <p className="duplicate-warning">Looks like a duplicate of "{dup.title}"</p>}
                  {item.annotation && <p className="command-annotation">{item.annotation}</p>}
                  <pre className="command-body">{item.body}</pre>
                  {itemTags.length > 0 && (
                    <div className="command-tags">
                      {itemTags.map((tag) => <span key={tag} className="command-tag">#{tag}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {expanded && (
      <div className="capture-actions">
        <button onClick={save} disabled={saving}>{single ? "Save" : `Save ${drafts.length} commands`}</button>
      </div>
      )}
    </section>
  );
}

function TagInput({ tags, draftValue, onDraftChange, onChange }: {
  tags: string[];
  draftValue: string;
  onDraftChange: (value: string) => void;
  onChange: (tags: string[]) => void;
}) {
  function addTags(values: string[]) {
    const next = [...tags];
    for (const value of values) {
      const clean = value.trim().toLowerCase();
      if (clean && !next.includes(clean)) {
        next.push(clean);
      }
    }
    onChange(next);
  }

  function commit() {
    if (draftValue.trim()) {
      addTags([draftValue]);
    }
    onDraftChange("");
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    if (value.includes(",")) {
      addTags(splitTags(value));
      onDraftChange("");
      return;
    }
    onDraftChange(value);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Backspace" && !draftValue && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="tag-input">
      {tags.map((tag) => (
        <span key={tag} className="tag-chip">
          #{tag}
          <button type="button" onClick={() => onChange(tags.filter((item) => item !== tag))} aria-label={`Remove tag ${tag}`}>×</button>
        </span>
      ))}
      <input
        value={draftValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={tags.length ? "" : "tags"}
      />
    </div>
  );
}

function Commands({ summary, onSaved, setNotice }: {
  summary: Summary;
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const entries = summary.entries.filter((entry) => entry.type === "command");

  const tags = [...new Set(entries.flatMap((entry) => entry.tags))].sort();

  const filtered = entries.filter((entry) => {
    const haystack = `${entry.title}\n${entry.body}\n${entry.annotation}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesTag = !activeTag || entry.tags.includes(activeTag);
    return matchesQuery && matchesTag;
  });

  return (
    <section className="panel">
      <CaptureWorkspace summary={summary} onSaved={onSaved} setNotice={setNotice} compact />
      <input
        className="command-filter"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Quick filter commands..."
      />
      {tags.length > 0 && (
        <div className="tag-filter-row">
          <button className={activeTag === "" ? "ghost active" : "ghost"} onClick={() => setActiveTag("")}>All</button>
          {tags.map((tag) => (
            <button key={tag} className={activeTag === tag ? "ghost active" : "ghost"} onClick={() => setActiveTag(tag)}>#{tag}</button>
          ))}
        </div>
      )}
      {!filtered.length && <p className="muted">No commands saved yet — capture one and it will show up here.</p>}
      <div className="command-list">
        {filtered.map((entry) => (
          <CommandCard key={entry.id} entry={entry} onSaved={onSaved} setNotice={setNotice} />
        ))}
      </div>
    </section>
  );
}

function NoteCaptureWorkspace({ summary, onSaved, setNotice, compact }: { summary: Summary; onSaved: () => Promise<void>; setNotice: (value: string) => void; compact?: boolean }) {
  const [rawBody, setRawBody] = useState("");
  const [annotation, setAnnotation] = useState("");
  const [tagsOverride, setTagsOverride] = useState<string[] | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const existingTags = useMemo(() => [...new Set(summary.entries.flatMap((entry) => entry.tags))], [summary.entries]);
  const draft = useMemo(
    () => organizeNoteDraft({ body: rawBody, annotation, tags: existingTags }),
    [rawBody, annotation, existingTags]
  );
  const tags = tagsOverride ?? draft.tags;
  const secretFindings = findSecrets(`${draft.title}\n${rawBody}\n${annotation}`);
  const expanded = !compact || rawBody.trim().length > 0;

  function resetCapture() {
    setRawBody("");
    setAnnotation("");
    setTagsOverride(null);
    setTagDraft("");
    setError("");
  }

  function redactSensitiveInfo() {
    setRawBody(redactSecrets(rawBody));
    setAnnotation(redactSecrets(annotation));
  }

  async function save() {
    if (savingRef.current) {
      return;
    }
    if (!rawBody.trim()) {
      setError("Write the steps or notes before saving.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (secretFindings.length
        && !window.confirm(`This note may contain sensitive information (${secretFindings.join(", ")}).\n\nSave anyway?`)) {
        return;
      }
      await createEntry({ title: draft.title, type: "note", body: rawBody.trim(), annotation: draft.annotation, tags });
      setNotice("Note saved");
      resetCapture();
      await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className={compact ? "capture-workspace compact" : "capture-workspace"}>
      <textarea
        autoFocus={!compact}
        className="capture-input note-input"
        value={rawBody}
        onChange={(event) => {
          setRawBody(event.target.value);
          setError("");
        }}
        placeholder={
          compact
            ? "Add a note... (steps or freeform text, Markdown supported)"
            : "Write a sequence of steps or freeform notes. Markdown (**bold**, # headings, - lists, `code`) is rendered once saved. Use #hashtags for tags.\nShift+Enter for a new line."
        }
      />
      {error && <p className="error inline-error">{error}</p>}

      {expanded && (
        <div className="panel detail-editor">
          {secretFindings.length > 0 && (
            <p className="secret-warning">
              May contain sensitive information ({secretFindings.join(", ")})
              <button type="button" className="ghost" onClick={redactSensitiveInfo}>Redact sensitive info</button>
            </p>
          )}
          <textarea
            className="annotation-input"
            value={annotation}
            onChange={(event) => setAnnotation(event.target.value)}
            placeholder="Add a short description (optional)"
          />
          <TagInput tags={tags} draftValue={tagDraft} onDraftChange={setTagDraft} onChange={setTagsOverride} />
        </div>
      )}

      {expanded && (
        <div className="capture-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setRawBody(formatNoteBody(rawBody))}
            disabled={!rawBody.trim()}
          >
            Format
          </button>
          <button onClick={save} disabled={saving}>Save</button>
        </div>
      )}
    </section>
  );
}

function Notes({ summary, onSaved, setNotice }: {
  summary: Summary;
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const entries = summary.entries.filter((entry) => entry.type === "note");

  const tags = [...new Set(entries.flatMap((entry) => entry.tags))].sort();

  const filtered = entries.filter((entry) => {
    const haystack = `${entry.title}\n${entry.body}\n${entry.annotation}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesTag = !activeTag || entry.tags.includes(activeTag);
    return matchesQuery && matchesTag;
  });

  return (
    <section className="panel notes-panel">
      <NoteCaptureWorkspace summary={summary} onSaved={onSaved} setNotice={setNotice} compact />
      <input
        className="command-filter"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Quick filter notes..."
      />
      {tags.length > 0 && (
        <div className="tag-filter-row">
          <button className={activeTag === "" ? "ghost active" : "ghost"} onClick={() => setActiveTag("")}>All</button>
          {tags.map((tag) => (
            <button key={tag} className={activeTag === tag ? "ghost active" : "ghost"} onClick={() => setActiveTag(tag)}>#{tag}</button>
          ))}
        </div>
      )}
      {!filtered.length && <p className="muted">No notes saved yet — capture one and it will show up here.</p>}
      <div className="command-list">
        {filtered.map((entry) => (
          <NoteCard key={entry.id} entry={entry} onSaved={onSaved} setNotice={setNotice} />
        ))}
      </div>
    </section>
  );
}

function NoteCard({ entry, onSaved, setNotice }: {
  entry: Entry;
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState(entry.annotation);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setAnnotationDraft(entry.annotation);
    }
  }, [entry.annotation, editing]);

  async function saveAnnotation(viaBlur: boolean) {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    try {
      const next = annotationDraft.trim();
      if (next === entry.annotation) {
        setEditing(false);
        return;
      }
      const findings = findSecrets(next);
      if (findings.length) {
        if (viaBlur) {
          return;
        }
        if (!window.confirm(`This looks like it may contain sensitive information:\n${findings.join(", ")}\n\nSave anyway?`)) {
          return;
        }
      }
      setEditing(false);
      await updateEntry(entry.id, { annotation: next });
      await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      savingRef.current = false;
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.body);
      setNotice(`Copied "${entry.title}"`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${entry.title}"?`)) {
      return;
    }
    try {
      await deleteEntry(entry.id);
      setNotice("Note deleted");
      await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <article className="command-card">
      <div className="command-card-top">
        <div className="command-tags">
          {entry.tags.map((tag) => <span key={tag} className="command-tag">#{tag}</span>)}
        </div>
        {editing ? (
          <>
            <textarea
              autoFocus
              className="command-annotation-edit"
              value={annotationDraft}
              onChange={(event) => setAnnotationDraft(event.target.value)}
              onBlur={() => saveAnnotation(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  saveAnnotation(false);
                } else if (event.key === "Escape") {
                  setAnnotationDraft(entry.annotation);
                  setEditing(false);
                }
              }}
            />
            {findSecrets(annotationDraft).length > 0 && (
              <button
                type="button"
                className="ghost redact-inline-button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setAnnotationDraft(redactSecrets(annotationDraft))}
              >
                Redact
              </button>
            )}
          </>
        ) : (
          <span
            className={entry.annotation ? "command-annotation editable" : "command-annotation editable empty"}
            onClick={() => setEditing(true)}
          >
            {entry.annotation || "Add a description..."}
          </span>
        )}
        <div className="command-actions">
          <button className="ghost" onClick={copy}>Copy</button>
          <button className="ghost" onClick={remove}>Delete</button>
        </div>
      </div>
      <div className="command-body note-body">
        <ReactMarkdown>{entry.body}</ReactMarkdown>
      </div>
    </article>
  );
}

function CommandCard({ entry, onSaved, setNotice }: {
  entry: Entry;
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState(entry.annotation);
  const [copiedLine, setCopiedLine] = useState<number | null>(null);
  const savingRef = useRef(false);
  const copiedLineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedLineTimeoutRef.current) {
        clearTimeout(copiedLineTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!editing) {
      setAnnotationDraft(entry.annotation);
    }
  }, [entry.annotation, editing]);

  async function saveAnnotation(viaBlur: boolean) {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    try {
      const next = annotationDraft.trim();
      if (next === entry.annotation) {
        setEditing(false);
        return;
      }
      const findings = findSecrets(next);
      if (findings.length) {
        // Never call window.confirm() from a blur handler — a dialog
        // opening while focus is already mid-transition is unreliable.
        // Leave editing open so the text isn't lost; the user presses
        // Enter (a deliberate action, not an incidental one) to get the
        // confirm prompt, or Escape to discard.
        if (viaBlur) {
          return;
        }
        if (!window.confirm(`This looks like it may contain sensitive information:\n${findings.join(", ")}\n\nSave anyway?`)) {
          return;
        }
      }
      setEditing(false);
      await updateEntry(entry.id, { annotation: next });
      await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      savingRef.current = false;
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.body);
      setNotice(`Copied "${entry.title}"`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function copyLine(line: string, index: number) {
    try {
      await navigator.clipboard.writeText(line);
      setCopiedLine(index);
      if (copiedLineTimeoutRef.current) {
        clearTimeout(copiedLineTimeoutRef.current);
      }
      copiedLineTimeoutRef.current = setTimeout(() => setCopiedLine(null), 1500);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${entry.title}"?`)) {
      return;
    }
    try {
      await deleteEntry(entry.id);
      setNotice("Command deleted");
      await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <article className="command-card">
      <div className="command-card-top">
        <div className="command-tags">
          {entry.tags.map((tag) => <span key={tag} className="command-tag">#{tag}</span>)}
        </div>
        {editing ? (
          <>
            <textarea
              autoFocus
              className="command-annotation-edit"
              value={annotationDraft}
              onChange={(event) => setAnnotationDraft(event.target.value)}
              onBlur={() => saveAnnotation(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  saveAnnotation(false);
                } else if (event.key === "Escape") {
                  setAnnotationDraft(entry.annotation);
                  setEditing(false);
                }
              }}
            />
            {findSecrets(annotationDraft).length > 0 && (
              <button
                type="button"
                className="ghost redact-inline-button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setAnnotationDraft(redactSecrets(annotationDraft))}
              >
                Redact
              </button>
            )}
          </>
        ) : (
          <span
            className={entry.annotation ? "command-annotation editable" : "command-annotation editable empty"}
            onClick={() => setEditing(true)}
          >
            {entry.annotation || "Add a description..."}
          </span>
        )}
        <div className="command-actions">
          <button className="ghost" onClick={copy}>Copy</button>
          <button className="ghost" onClick={remove}>Delete</button>
        </div>
      </div>
      <pre className="command-body command-body-lines">
        {entry.body.split("\n").map((line, index) => (
          <span className="command-body-line" key={index}>
            {isCommentLine(line) || !line.trim() ? (
              <span className="command-line-copy-spacer" aria-hidden="true" />
            ) : (
              <button
                type="button"
                className={copiedLine === index ? "command-line-copy copied" : "command-line-copy"}
                onClick={() => copyLine(line, index)}
                aria-label={`Copy line: ${line}`}
              >
                {copiedLine === index ? "✓" : "⧉"}
              </button>
            )}
            <span className="command-body-line-text">{line}</span>
          </span>
        ))}
      </pre>
    </article>
  );
}

function splitTags(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function mergeTags(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

function findDuplicate(body: string, entries: Entry[]): Entry | undefined {
  const normalized = normalizeCommandBody(body);
  if (!normalized) {
    return undefined;
  }
  return entries.find((entry) => normalizeCommandBody(entry.body) === normalized);
}

function labelView(view: View): string {
  return { capture: "Capture", commands: "Commands", notes: "Notes" }[view];
}

createRoot(document.getElementById("root")!).render(<App />);
