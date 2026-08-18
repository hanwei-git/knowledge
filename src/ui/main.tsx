import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEntry, deleteEntry, getSummary, subscribeToChanges } from "./api.js";
import { organizeDraft } from "../core/organizer.js";
import type { CreateEntryInput, Entry, Summary } from "../core/types.js";
import "./styles.css";

type View = "capture" | "commands";

const emptySummary: Summary = { entries: [], tags: [] };

function App() {
  const [view, setView] = useState<View>("capture");
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
          {(["capture", "commands"] as View[]).map((item) => (
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

        {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}

        {view === "capture" && <CaptureWorkspace summary={summary} onSaved={refresh} setNotice={setNotice} />}
        {view === "commands" && <Commands entries={summary.entries} onSaved={refresh} setNotice={setNotice} />}
      </section>
    </main>
  );
}

function CaptureWorkspace({ summary, onSaved, setNotice }: { summary: Summary; onSaved: () => Promise<void>; setNotice: (value: string) => void }) {
  const [rawInput, setRawInput] = useState("");
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [tagsOverride, setTagsOverride] = useState<string[] | null>(null);
  const [annotationOverride, setAnnotationOverride] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const draft = useMemo(() => organizeDraft({ body: rawInput, tags: summary.tags }), [rawInput, summary.tags]);
  const title = titleOverride ?? draft.title;
  const tags = tagsOverride ?? draft.tags;
  const annotation = annotationOverride ?? draft.annotation;

  function resetCapture() {
    setRawInput("");
    setTitleOverride(null);
    setTagsOverride(null);
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
      const input: CreateEntryInput = { title, body: draft.body, annotation, tags };
      await createEntry(input);
      resetCapture();
      setNotice("Command saved");
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
          setTitleOverride(null);
          setTagsOverride(null);
          setAnnotationOverride(null);
          setError("");
        }}
        placeholder={"Paste a command (one line or a block).\nWrite your own comments with # / -- / // — they become the description, and are kept out of the copyable command."}
      />
      {error && <p className="error inline-error">{error}</p>}
      <div className="panel detail-editor">
        <div className="row">
          <input value={title} onChange={(event) => setTitleOverride(event.target.value)} placeholder="Title" />
          <input value={tags.join(", ")} onChange={(event) => setTagsOverride(splitTags(event.target.value))} placeholder="tags" />
        </div>
        <textarea
          className="annotation-input"
          value={annotation}
          onChange={(event) => setAnnotationOverride(event.target.value)}
          placeholder="What does this do? (auto-filled from your comment, or a guess when recognized)"
        />
      </div>
      <div className="capture-actions">
        <button onClick={save} disabled={saving}>Save</button>
      </div>
    </section>
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

  async function copy(entry: Entry) {
    try {
      await navigator.clipboard.writeText(entry.body);
      setNotice(`Copied "${entry.title}"`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function remove(entry: Entry) {
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
          <article className="command-card" key={entry.id}>
            <div className="command-card-header">
              <h4>{entry.title}</h4>
              <div className="command-card-actions">
                <button className="ghost" onClick={() => copy(entry)}>Copy</button>
                <button className="ghost" onClick={() => remove(entry)}>Delete</button>
              </div>
            </div>
            {entry.annotation && <p className="command-annotation">{entry.annotation}</p>}
            <pre className="command-body">{entry.body}</pre>
            {entry.tags.length > 0 && (
              <footer>
                {entry.tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </footer>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function splitTags(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function labelView(view: View): string {
  return { capture: "Capture", commands: "Commands" }[view];
}

createRoot(document.getElementById("root")!).render(<App />);
