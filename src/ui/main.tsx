import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEntry, deleteEntry, getSummary, subscribeToChanges, updateEntry } from "./api.js";
import { organizeDrafts } from "../core/organizer.js";
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
  const [tagsOverride, setTagsOverride] = useState<string[] | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [annotationOverride, setAnnotationOverride] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const drafts = useMemo(
    () => organizeDrafts({ body: rawInput, tags: summary.tags, split: splitEnabled }),
    [rawInput, summary.tags, splitEnabled]
  );
  const single = drafts.length === 1;
  const draft = drafts[0];
  const tags = single ? tagsOverride ?? draft.tags : draft.tags;
  const annotation = single ? annotationOverride ?? draft.annotation : draft.annotation;

  function resetCapture() {
    setRawInput("");
    setTagsOverride(null);
    setTagDraft("");
    setAnnotationOverride(null);
    setError("");
  }

  async function save() {
    if (!rawInput.trim()) {
      setError("Paste or type a command before saving.");
      return;
    }
    setSaving(true);
    try {
      if (single) {
        await createEntry({ title: draft.title, body: draft.body, annotation, tags });
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
          <textarea
            className="annotation-input"
            value={annotation}
            onChange={(event) => setAnnotationOverride(event.target.value)}
            placeholder="What does this do? (auto-filled from your comment, or a guess when recognized)"
          />
          <div className="row">
            <pre className="command-body command-body-preview">{draft.body}</pre>
            <TagInput tags={tags} draftValue={tagDraft} onDraftChange={setTagDraft} onChange={setTagsOverride} />
          </div>
        </div>
      ) : (
        <div className="panel detail-editor">
          <p className="muted">{drafts.length} commands detected — each will be saved as its own entry.</p>
          <div className="draft-preview-list">
            {drafts.map((item, index) => (
              <div className="draft-preview" key={index}>
                {item.annotation && <p className="command-annotation">{item.annotation}</p>}
                <pre className="command-body">{item.body}</pre>
              </div>
            ))}
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

  useEffect(() => {
    if (!editing) {
      setAnnotationDraft(entry.annotation);
    }
  }, [entry.annotation, editing]);

  async function saveAnnotation() {
    setEditing(false);
    const next = annotationDraft.trim();
    if (next === entry.annotation) {
      return;
    }
    try {
      await updateEntry(entry.id, { annotation: next });
      await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
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
        <div className="command-actions">
          <button className="ghost" onClick={copy}>Copy</button>
          <button className="ghost" onClick={remove}>Delete</button>
        </div>
      </div>
      {editing ? (
        <textarea
          autoFocus
          className="command-annotation-edit"
          value={annotationDraft}
          onChange={(event) => setAnnotationDraft(event.target.value)}
          onBlur={saveAnnotation}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              saveAnnotation();
            } else if (event.key === "Escape") {
              setAnnotationDraft(entry.annotation);
              setEditing(false);
            }
          }}
        />
      ) : (
        <p
          className={entry.annotation ? "command-annotation editable" : "command-annotation editable empty"}
          onClick={() => setEditing(true)}
        >
          {entry.annotation || "Add a description..."}
        </p>
      )}
      <pre className="command-body">{entry.body}</pre>
    </article>
  );
}

function splitTags(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function labelView(view: View): string {
  return { capture: "Capture", commands: "Commands" }[view];
}

createRoot(document.getElementById("root")!).render(<App />);
