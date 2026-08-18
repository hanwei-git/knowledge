import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEntry, deleteEntry, getSummary, subscribeToChanges, updateEntry } from "./api.js";
import { normalizeCommandBody } from "../core/commandRules.js";
import { organizeDrafts } from "../core/organizer.js";
import { findSecrets } from "../core/secretScanner.js";
import type { Entry, Summary } from "../core/types.js";
import "./styles.css";

type View = "capture" | "commands";

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
          {(["commands", "capture"] as View[]).map((item) => (
            <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)}>
              {labelView(item)}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>{summary.entries.length}</span> commands
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
        {view === "commands" && <Commands entries={summary.entries} onSaved={refresh} setNotice={setNotice} />}
      </section>

      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

function CaptureWorkspace({ summary, onSaved, setNotice }: { summary: Summary; onSaved: () => Promise<void>; setNotice: (value: string) => void }) {
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
    () => organizeDrafts({ body: rawInput, tags: summary.tags, split: splitEnabled }),
    [rawInput, summary.tags, splitEnabled]
  );
  const single = drafts.length === 1;
  const draft = drafts[0];
  const body = single ? bodyOverride ?? draft.body : draft.body;
  const tags = single ? tagsOverride ?? draft.tags : draft.tags;
  const annotation = single ? annotationOverride ?? draft.annotation : draft.annotation;
  const duplicateOf = single ? findDuplicate(body, summary.entries) : undefined;

  function resetCapture() {
    setRawInput("");
    setBodyOverride(null);
    setTagsOverride(null);
    setTagDraft("");
    setAnnotationOverride(null);
    setError("");
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
        ? [{ title: draft.title, body, annotation }]
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
        await createEntry({ title: draft.title, body, annotation, tags });
        setNotice("Command saved");
      } else {
        for (const item of drafts) {
          await createEntry({ title: item.title, body: item.body, annotation: item.annotation, tags: item.tags });
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
    <section className="capture-workspace">
      <textarea
        autoFocus
        className="capture-input"
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
        placeholder={"Paste one or more commands. Use # / -- / // for your own comments.\nEnter to save, Shift+Enter for a new line."}
      />
      {error && <p className="error inline-error">{error}</p>}
      <label className="split-toggle">
        <input type="checkbox" checked={splitEnabled} onChange={(event) => setSplitEnabled(event.target.checked)} />
        Split multiple commands into separate entries
      </label>

      {single ? (
        <div className="panel detail-editor">
          {duplicateOf && <p className="duplicate-warning">Looks like a duplicate of "{duplicateOf.title}"</p>}
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
          <div className="draft-preview-list">
            {drafts.map((item, index) => {
              const dup = findDuplicate(item.body, summary.entries);
              return (
                <div className="draft-preview" key={index}>
                  {dup && <p className="duplicate-warning">Looks like a duplicate of "{dup.title}"</p>}
                  {item.annotation && <p className="command-annotation">{item.annotation}</p>}
                  <pre className="command-body">{item.body}</pre>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="capture-actions">
        <button onClick={save} disabled={saving}>{single ? "Save" : `Save ${drafts.length} commands`}</button>
      </div>
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

function Commands({ entries, onSaved, setNotice }: {
  entries: Entry[];
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");

  const tags = [...new Set(entries.flatMap((entry) => entry.tags))].sort();

  const filtered = entries.filter((entry) => {
    const haystack = `${entry.title}\n${entry.body}\n${entry.annotation}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesTag = !activeTag || entry.tags.includes(activeTag);
    return matchesQuery && matchesTag;
  });

  return (
    <section className="panel">
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

function CommandCard({ entry, onSaved, setNotice }: {
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
      <pre className="command-body">{entry.body}</pre>
    </article>
  );
}

function splitTags(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function findDuplicate(body: string, entries: Entry[]): Entry | undefined {
  const normalized = normalizeCommandBody(body);
  if (!normalized) {
    return undefined;
  }
  return entries.find((entry) => normalizeCommandBody(entry.body) === normalized);
}

function labelView(view: View): string {
  return { capture: "Capture", commands: "Commands" }[view];
}

createRoot(document.getElementById("root")!).render(<App />);
