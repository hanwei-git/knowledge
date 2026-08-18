import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEntry, deleteEntry, getSummary, organizeCapture, searchEntries, subscribeToChanges, updateEntry } from "./api.js";
import type { OrganizedDraft } from "../core/organizer.js";
import type { CreateEntryInput, Entry, EntryStatus, EntryType, SearchFilters, Summary } from "../core/types.js";
import "./styles.css";

type View = "capture" | "browse";

const entryTypes: EntryType[] = ["troubleshooting", "decision", "reference", "runbook", "note"];
const statuses: EntryStatus[] = ["draft", "active", "archived"];
const emptySummary: Summary = { entries: [], projects: [], tags: [] };

function App() {
  const [view, setView] = useState<View>("capture");
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");

  async function refresh() {
    setSummary(await getSummary());
    setRevision((value) => value + 1);
  }

  useEffect(() => {
    refresh().catch((error) => setNotice(error.message));
    return subscribeToChanges(() => {
      refresh().catch((error) => setNotice(error.message));
    });
  }, []);

  const draftCount = summary.entries.filter((entry) => entry.status === "draft").length;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">kb</span>
          <div>
            <strong>Knowledge</strong>
            <small>Cloud-synced notes</small>
          </div>
        </div>
        <nav>
          {(["capture", "browse"] as View[]).map((item) => (
            <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)}>
              {labelView(item)}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>{summary.entries.length}</span> entries
          <span>{draftCount}</span> to triage
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
        {view === "browse" && <Browse revision={revision} projects={summary.projects} tags={summary.tags} onSaved={refresh} setNotice={setNotice} />}
      </section>
    </main>
  );
}

function CaptureWorkspace({ summary, onSaved, setNotice }: { summary: Summary; onSaved: () => Promise<void>; setNotice: (value: string) => void }) {
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState<OrganizedDraft | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveInbox() {
    if (!validateBody(body)) {
      return;
    }
    await save({
      title: titleFromBody(body),
      body: body.trim(),
      tags: [],
      type: "note",
      project: "",
      status: "draft",
      source: ""
    }, "Saved to inbox for review");
  }

  async function organizeAndSave() {
    if (!validateBody(body)) {
      return;
    }
    const organized = await ensureDraft();
    await save({
      title: organized.title,
      body: organized.body,
      tags: organized.tags,
      type: organized.type,
      project: organized.project,
      status: organized.status,
      source: organized.source
    }, organized.project ? `Saved to ${organized.project}` : "Saved to inbox; project needs review");
  }

  async function save(input: CreateEntryInput, message: string) {
    setSaving(true);
    try {
      await createEntry(input);
      resetCapture();
      setNotice(message);
      await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function reviewDetails() {
    if (!validateBody(body)) {
      return;
    }
    try {
      await ensureDraft();
      setDetailsOpen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function ensureDraft(): Promise<OrganizedDraft> {
    if (draft) {
      return draft;
    }
    const organized = await organizeCapture(body);
    setDraft(organized);
    return organized;
  }

  function updateDraft(updates: Partial<OrganizedDraft>) {
    setDraft((current) => current ? { ...current, ...updates } : current);
  }

  function validateBody(value: string): boolean {
    if (!value.trim()) {
      setError("Paste or type something before saving.");
      return false;
    }
    setError("");
    return true;
  }

  function resetCapture() {
    setBody("");
    setDraft(null);
    setDetailsOpen(false);
    setError("");
  }

  const suggestion = draft ?? {
    project: "",
    type: "note" as EntryType,
    tags: [] as string[],
    status: "draft" as EntryStatus,
    source: "",
    title: titleFromBody(body),
    body,
    saveTarget: "inbox" as const,
    reason: body.trim() ? "Ready to organize on save." : "Waiting for input."
  };

  return (
    <section className="capture-workspace">
      <textarea
        autoFocus
        className="capture-input"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          setDraft(null);
          setDetailsOpen(false);
          setError("");
        }}
        placeholder="Paste logs, notes, links, decisions, command output, or rough thoughts..."
      />
      {error && <p className="error inline-error">{error}</p>}
      <div className="capture-actions">
        <button onClick={organizeAndSave} disabled={saving}>Organize and save</button>
        <button className="ghost" onClick={saveInbox} disabled={saving}>Save to inbox</button>
        <div className="suggestion-row" aria-label="Suggested metadata">
          <span className="suggestion-label">Suggested</span>
          <span>{suggestion.project || "inbox"}</span>
          <span>{suggestion.type}</span>
          {suggestion.tags.map((tag) => <span key={tag}>#{tag}</span>)}
          <small>{suggestion.reason}</small>
        </div>
        <button className="ghost" onClick={reviewDetails} disabled={saving}>Review details</button>
      </div>

      {detailsOpen && draft && (
        <form className="panel detail-editor" onSubmit={(event) => {
          event.preventDefault();
          organizeAndSave();
        }}>
          <div className="row">
            <input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="Title" required />
            <input
              value={draft.project}
              onChange={(event) => updateDraft({ project: event.target.value, status: event.target.value ? "active" : "draft" })}
              placeholder="Project (optional)"
              list="known-projects"
            />
          </div>
          <div className="detail-grid">
            <select value={draft.type} onChange={(event) => updateDraft({ type: event.target.value as EntryType })}>
              {entryTypes.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as EntryStatus })}>
              {statuses.map((item) => <option key={item}>{item}</option>)}
            </select>
            <input value={draft.tags.join(", ")} onChange={(event) => updateDraft({ tags: splitTags(event.target.value) })} placeholder="tags" />
          </div>
          <input value={draft.source} onChange={(event) => updateDraft({ source: event.target.value })} placeholder="source URL or file path" />
          <div className="detail-actions">
            <button disabled={saving}>Save with details</button>
            <button className="ghost" type="button" onClick={() => setDetailsOpen(false)}>Close details</button>
          </div>
        </form>
      )}
      <datalist id="known-projects">
        {summary.projects.map((project) => <option key={project} value={project} />)}
      </datalist>
    </section>
  );
}

function titleFromBody(body: string): string {
  const line = body
    .split("\n")
    .map((item) => item.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  if (!line) {
    return "Untitled note";
  }
  return line.length > 72 ? `${line.slice(0, 69).trimEnd()}...` : line;
}

function Browse({ revision, projects, tags, onSaved, setNotice }: {
  revision: number;
  projects: string[];
  tags: string[];
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [filters, setFilters] = useState<SearchFilters>({});
  const [results, setResults] = useState<Entry[]>([]);

  async function runSearch(next: SearchFilters) {
    try {
      setResults(await searchEntries(next));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    runSearch(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await runSearch(filters);
  }

  return (
    <section className="panel">
      <form className="search-form" onSubmit={submit}>
        <input value={filters.query ?? ""} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Search title, body, or tags" />
        <select value={filters.project ?? ""} onChange={(event) => setFilters({ ...filters, project: event.target.value })}>
          <option value="">All projects</option>
          {projects.map((project) => <option key={project} value={project}>{project}</option>)}
        </select>
        <select value={filters.type ?? ""} onChange={(event) => setFilters({ ...filters, type: event.target.value as SearchFilters["type"] })}>
          <option value="">All types</option>
          {entryTypes.map((type) => <option key={type}>{type}</option>)}
        </select>
        <select value={filters.tag ?? ""} onChange={(event) => setFilters({ ...filters, tag: event.target.value })}>
          <option value="">All tags</option>
          {tags.map((tag) => <option key={tag}>{tag}</option>)}
        </select>
        <select value={filters.status ?? ""} onChange={(event) => setFilters({ ...filters, status: event.target.value as SearchFilters["status"] })}>
          <option value="">All statuses</option>
          {statuses.map((status) => <option key={status}>{status}</option>)}
        </select>
        <button>Search</button>
      </form>
      <EntryList entries={results} empty="Nothing here yet — capture a note to get started." projects={projects} onSaved={onSaved} setNotice={setNotice} />
      <datalist id="known-projects">
        {projects.map((project) => <option key={project} value={project} />)}
      </datalist>
    </section>
  );
}

function EntryList({ entries, empty, projects, onSaved, setNotice }: {
  entries: Entry[];
  empty: string;
  projects: string[];
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  if (!entries.length) {
    return <p className="muted">{empty}</p>;
  }
  return (
    <div className="entry-list">
      {entries.map((entry) => <EntryBlock key={entry.id} entry={entry} projects={projects} onSaved={onSaved} setNotice={setNotice} />)}
    </div>
  );
}

function EntryBlock({ entry, projects, onSaved, setNotice }: {
  entry: Entry;
  projects: string[];
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  async function remove() {
    if (!window.confirm(`Delete "${entry.title}"?`)) {
      return;
    }
    try {
      await deleteEntry(entry.id);
      setNotice("Entry deleted");
      await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <article className="entry-block">
      <div>
        <h4>{entry.title}</h4>
        <p>{entry.body.slice(0, 180)}</p>
      </div>
      <footer>
        <span>{entry.type}</span>
        <span>{entry.status}</span>
        {entry.project && <span>{entry.project}</span>}
        {entry.tags.map((tag) => <span key={tag}>#{tag}</span>)}
      </footer>
      {entry.status === "draft" && <TriageControls entry={entry} projects={projects} onSaved={onSaved} setNotice={setNotice} />}
      <button className="ghost entry-delete" onClick={remove}>Delete</button>
    </article>
  );
}

function TriageControls({ entry, projects, onSaved, setNotice }: {
  entry: Entry;
  projects: string[];
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [project, setProject] = useState(projects[0] ?? "");
  const [type, setType] = useState<EntryType>("note");
  const [tags, setTags] = useState(entry.tags.join(", "));

  async function archive() {
    try {
      await updateEntry(entry.id, { project, type, tags: splitTags(tags), status: "active" });
      setNotice("Moved out of the inbox");
      await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="archive-controls">
      <input value={project} onChange={(event) => setProject(event.target.value)} placeholder="Project" list="known-projects" />
      <select value={type} onChange={(event) => setType(event.target.value as EntryType)}>
        {entryTypes.map((item) => <option key={item}>{item}</option>)}
      </select>
      <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="tags" />
      <button onClick={archive} disabled={!project}>Archive</button>
    </div>
  );
}

function splitTags(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function labelView(view: View): string {
  return { capture: "Capture", browse: "Browse" }[view];
}

createRoot(document.getElementById("root")!).render(<App />);
