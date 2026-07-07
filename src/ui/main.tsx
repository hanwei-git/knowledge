import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  archiveEntry,
  commitKnowledge,
  createInboxEntry,
  createProject,
  createStructuredEntry,
  getGitDiff,
  getGitLog,
  getGitStatus,
  getSummary,
  organizeCapture,
  searchEntries
} from "./api.js";
import type { OrganizedDraft } from "../core/organizer.js";
import type { EntryStatus, EntryType, KnowledgeEntry, ProjectWiki, SearchFilters } from "../core/types.js";
import "./styles.css";

type View = "home" | "projects" | "inbox" | "search" | "git";

const entryTypes: EntryType[] = ["troubleshooting", "decision", "reference", "runbook", "note"];
const statuses: EntryStatus[] = ["draft", "active", "archived"];

function App() {
  const [view, setView] = useState<View>("home");
  const [summary, setSummary] = useState({ entries: [] as KnowledgeEntry[], projects: [] as ProjectWiki[], inbox: [] as KnowledgeEntry[], tags: [] as string[] });
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    setSummary(await getSummary());
  }

  useEffect(() => {
    refresh().catch((error) => setNotice(error.message));
  }, []);

  const currentProject = summary.projects.find((project) => project.slug === selectedProject) ?? summary.projects[0];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">md</span>
          <div>
            <strong>Engineering Wiki</strong>
            <small>Markdown knowledge desk</small>
          </div>
        </div>
        <nav>
          {(["home", "projects", "inbox", "search", "git"] as View[]).map((item) => (
            <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)}>
              {labelView(item)}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>{summary.entries.length}</span> entries
          <span>{summary.projects.length}</span> projects
          <span>{summary.inbox.length}</span> inbox
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Local-first / Git-backed / Markdown portable</p>
            <h1>{labelView(view)}</h1>
          </div>
          <button className="ghost" onClick={() => refresh().then(() => setNotice("Refreshed"))}>Refresh</button>
        </header>

        {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}

        {view === "home" && <Home summary={summary} onSaved={refresh} setNotice={setNotice} />}
        {view === "projects" && <Projects projects={summary.projects} selected={currentProject} onSelect={setSelectedProject} onSaved={refresh} setNotice={setNotice} />}
        {view === "inbox" && <Inbox entries={summary.inbox} projects={summary.projects} onSaved={refresh} setNotice={setNotice} />}
        {view === "search" && <Search projects={summary.projects} tags={summary.tags} setNotice={setNotice} />}
        {view === "git" && <GitPanel setNotice={setNotice} />}
      </section>
    </main>
  );
}

function Home({ summary, onSaved, setNotice }: { summary: Awaited<ReturnType<typeof getSummary>>; onSaved: () => Promise<void>; setNotice: (value: string) => void }) {
  return (
    <CaptureWorkspace summary={summary} onSaved={onSaved} setNotice={setNotice} />
  );
}

function CaptureWorkspace({ summary, onSaved, setNotice }: { summary: Awaited<ReturnType<typeof getSummary>>; onSaved: () => Promise<void>; setNotice: (value: string) => void }) {
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState<OrganizedDraft | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveInbox() {
    if (!validateBody(body)) {
      return;
    }
    setSaving(true);
    try {
      await createInboxEntry({
        title: titleFromBody(body),
        body: body.trim(),
        tags: [],
        type: "note",
        project: "",
        status: "draft",
        source: ""
      });
      resetCapture();
      setNotice("Saved to inbox for project review");
      await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function organizeAndSave() {
    if (!validateBody(body)) {
      return;
    }
    setSaving(true);
    try {
      const organized = await ensureDraft();
      const input = {
        title: organized.title,
        body: organized.body,
        tags: organized.tags,
        type: organized.type,
        project: organized.project,
        status: organized.status,
        source: organized.source
      };
      const entry = organized.project ? await createStructuredEntry(input) : await createInboxEntry(input);
      resetCapture();
      setNotice(organized.project ? `Saved to ${entry.metadata.project}` : "Saved to inbox; project needs review");
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
          <span>{suggestion.status}</span>
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
            <select value={draft.project} onChange={(event) => updateDraft({ project: event.target.value, status: event.target.value ? "active" : "draft" })}>
              <option value="">Inbox</option>
              {summary.projects.map((project) => <option key={project.slug} value={project.slug}>{project.title}</option>)}
            </select>
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

function Projects({ projects, selected, onSelect, onSaved, setNotice }: {
  projects: ProjectWiki[];
  selected?: ProjectWiki;
  onSelect: (slug: string) => void;
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  return (
    <div className="grid project-layout">
      <section className="panel">
        <h2>Project map</h2>
        <CreateProjectForm onSaved={onSaved} setNotice={setNotice} />
        <div className="project-stack">
          {projects.map((project) => (
            <button className={`project-button ${selected?.slug === project.slug ? "active" : ""}`} key={project.slug} onClick={() => onSelect(project.slug)}>
              <strong>{project.title}</strong>
              <small>{project.slug}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel main-panel">
        {selected ? (
          <>
            <div className="project-heading">
              <div>
                <p className="eyebrow">{selected.slug}</p>
                <h2>{selected.title}</h2>
                <p>{selected.summary}</p>
              </div>
            </div>
            <CreateStructuredEntry project={selected.slug} onSaved={onSaved} setNotice={setNotice} />
            <WikiGroups project={selected} />
          </>
        ) : (
          <p className="muted">Create a project first. Project pages are the primary wiki anchors.</p>
        )}
      </section>
    </div>
  );
}

function CreateProjectForm({ onSaved, setNotice }: { onSaved: () => Promise<void>; setNotice: (value: string) => void }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await createProject({ title, slug, summary });
    setTitle("");
    setSlug("");
    setSummary("");
    setNotice("Project page created");
    await onSaved();
  }

  return (
    <form className="compact-form" onSubmit={submit}>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Project title" required />
      <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="project-slug" />
      <textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What this system owns" required />
      <button>Create project</button>
    </form>
  );
}

function CreateStructuredEntry({ project, onSaved, setNotice }: { project: string; onSaved: () => Promise<void>; setNotice: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EntryType>("troubleshooting");
  const [tags, setTags] = useState("");
  const [source, setSource] = useState("");
  const [body, setBody] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await createStructuredEntry({ title, type, project, tags: splitTags(tags), status: "active", source, body });
    setTitle("");
    setTags("");
    setSource("");
    setBody("");
    setOpen(false);
    setNotice("Entry added to project");
    await onSaved();
  }

  return (
    <div className="inline-editor">
      <button className="ghost" onClick={() => setOpen(!open)}>{open ? "Close editor" : "Add structured entry"}</button>
      {open && (
        <form className="compact-form" onSubmit={submit}>
          <div className="row">
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Entry title" required />
            <select value={type} onChange={(event) => setType(event.target.value as EntryType)}>
              {entryTypes.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="tags" />
          <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="source URL or file path" />
          <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={templateHint(type)} required />
          <button>Save entry</button>
        </form>
      )}
    </div>
  );
}

function WikiGroups({ project }: { project: ProjectWiki }) {
  return (
    <div className="wiki-groups">
      {entryTypes.map((type) => (
        <section key={type}>
          <h3>{type}</h3>
          <EntryList entries={project.groups[type] ?? []} empty={`No ${type} entries.`} />
        </section>
      ))}
    </div>
  );
}

function Inbox({ entries, projects, onSaved, setNotice }: { entries: KnowledgeEntry[]; projects: ProjectWiki[]; onSaved: () => Promise<void>; setNotice: (value: string) => void }) {
  return (
    <div className="panel">
      <h2>Inbox triage</h2>
      <p className="muted">Turn rough notes into project knowledge by choosing a project, type, status, and tags.</p>
      <div className="inbox-list">
        {entries.map((entry) => <ArchiveCard key={entry.relativePath} entry={entry} projects={projects} onSaved={onSaved} setNotice={setNotice} />)}
        {!entries.length && <p className="muted">Inbox is clear.</p>}
      </div>
    </div>
  );
}

function ArchiveCard({ entry, projects, onSaved, setNotice }: { entry: KnowledgeEntry; projects: ProjectWiki[]; onSaved: () => Promise<void>; setNotice: (value: string) => void }) {
  const [project, setProject] = useState(projects[0]?.slug ?? "");
  const [type, setType] = useState<EntryType>("troubleshooting");
  const [status, setStatus] = useState<EntryStatus>("active");
  const [tags, setTags] = useState(entry.metadata.tags.join(", "));

  async function archive() {
    await archiveEntry(entry.relativePath, { project, type, status, tags: splitTags(tags) });
    setNotice("Inbox entry archived");
    await onSaved();
  }

  return (
    <article className="archive-card">
      <EntryBlock entry={entry} />
      <div className="archive-controls">
        <select value={project} onChange={(event) => setProject(event.target.value)}>
          {projects.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}
        </select>
        <select value={type} onChange={(event) => setType(event.target.value as EntryType)}>
          {entryTypes.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value as EntryStatus)}>
          {statuses.map((item) => <option key={item}>{item}</option>)}
        </select>
        <input value={tags} onChange={(event) => setTags(event.target.value)} />
        <button onClick={archive} disabled={!project}>Archive</button>
      </div>
    </article>
  );
}

function Search({ projects, tags, setNotice }: { projects: ProjectWiki[]; tags: string[]; setNotice: (value: string) => void }) {
  const [filters, setFilters] = useState<SearchFilters>({});
  const [results, setResults] = useState<KnowledgeEntry[]>([]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setResults(await searchEntries(filters));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="panel">
      <form className="search-form" onSubmit={submit}>
        <input value={filters.query ?? ""} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Search title, Markdown body, or tags" />
        <select value={filters.project ?? ""} onChange={(event) => setFilters({ ...filters, project: event.target.value })}>
          <option value="">All projects</option>
          {projects.map((project) => <option key={project.slug} value={project.slug}>{project.title}</option>)}
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
      <EntryList entries={results} empty="Run a search to see matching Markdown entries." />
    </section>
  );
}

function GitPanel({ setNotice }: { setNotice: (value: string) => void }) {
  const [changes, setChanges] = useState<unknown>([]);
  const [diff, setDiff] = useState("");
  const [log, setLog] = useState<unknown>([]);
  const [message, setMessage] = useState("");

  async function refreshGit() {
    const [statusResult, diffResult, logResult] = await Promise.all([getGitStatus(), getGitDiff(), getGitLog()]);
    setChanges(statusResult);
    setDiff(typeof diffResult.diff === "string" ? diffResult.diff : diffResult.diff.error);
    setLog(logResult);
  }

  useEffect(() => {
    refreshGit().catch((error) => setNotice(error.message));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await commitKnowledge(message);
    setNotice(result.output || "Knowledge committed");
    setMessage("");
    await refreshGit();
  }

  const normalizedChanges = Array.isArray(changes) ? changes : [];
  const normalizedLog = Array.isArray(log) ? log : [];
  const gitError = !Array.isArray(changes) ? (changes as { error: string }).error : !Array.isArray(log) ? (log as { error: string }).error : "";

  return (
    <div className="grid two">
      <section className="panel">
        <h2>Local Git changes</h2>
        {gitError && <p className="error">{gitError}</p>}
        <button className="ghost" onClick={refreshGit}>Refresh Git</button>
        <ul className="change-list">
          {normalizedChanges.map((change) => <li key={`${change.code}-${change.path}`}><span>{change.code}</span>{change.path}</li>)}
          {!normalizedChanges.length && <li className="muted">No local changes reported.</li>}
        </ul>
        <form className="compact-form" onSubmit={submit}>
          <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Commit message" required />
          <button>Commit knowledge files</button>
        </form>
      </section>
      <section className="panel">
        <h2>Diff</h2>
        <pre className="diff">{diff || "No diff for knowledge/."}</pre>
      </section>
      <section className="panel">
        <h2>Recent knowledge commits</h2>
        <ul className="log-list">
          {normalizedLog.map((item) => <li key={item}>{item}</li>)}
          {!normalizedLog.length && <li className="muted">No knowledge history yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function EntryList({ entries, empty }: { entries: KnowledgeEntry[]; empty: string }) {
  if (!entries.length) {
    return <p className="muted">{empty}</p>;
  }
  return <div className="entry-list">{entries.map((entry) => <EntryBlock key={entry.relativePath} entry={entry} />)}</div>;
}

function EntryBlock({ entry }: { entry: KnowledgeEntry }) {
  return (
    <article className="entry-block">
      <div>
        <h4>{entry.metadata.title}</h4>
        <p>{entry.excerpt}</p>
      </div>
      <footer>
        <span>{entry.metadata.type}</span>
        <span>{entry.metadata.status}</span>
        {entry.metadata.project && <span>{entry.metadata.project}</span>}
        {entry.metadata.tags.map((tag) => <span key={tag}>#{tag}</span>)}
      </footer>
      <small>{entry.relativePath}</small>
    </article>
  );
}

function ProjectCard({ project }: { project: ProjectWiki }) {
  const total = useMemo(() => entryTypes.reduce((count, type) => count + (project.groups[type]?.length ?? 0), 0), [project]);
  return (
    <article className="project-card">
      <strong>{project.title}</strong>
      <p>{project.summary || "No summary yet."}</p>
      <small>{total} entries / {project.slug}</small>
    </article>
  );
}

function splitTags(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function labelView(view: View): string {
  return {
    home: "Workbench",
    projects: "Project Wiki",
    inbox: "Inbox",
    search: "Search",
    git: "Git History"
  }[view];
}

function templateHint(type: EntryType): string {
  const hints: Record<EntryType, string> = {
    troubleshooting: "## Symptom\n\n## Cause\n\n## Fix\n\n## Verification\n\n## Reuse notes",
    decision: "## Context\n\n## Decision\n\n## Alternatives\n\n## Consequences",
    reference: "## Source summary\n\n## Key points\n\n## How it applies",
    runbook: "## When to use\n\n## Steps\n\n## Rollback\n\n## Checks",
    note: "Write the useful thing plainly.",
    project: "Project overview"
  };
  return hints[type];
}

createRoot(document.getElementById("root")!).render(<App />);
