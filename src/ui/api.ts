import type { CreateEntryInput, CreateProjectInput, EntryMetadata, KnowledgeEntry, ProjectWiki, SearchFilters } from "../core/types.js";

export interface Summary {
  entries: KnowledgeEntry[];
  projects: ProjectWiki[];
  inbox: KnowledgeEntry[];
  tags: string[];
}

export interface GitChange {
  code: string;
  path: string;
  staged: boolean;
}

export async function getSummary(): Promise<Summary> {
  return request("/api/summary");
}

export async function createInboxEntry(input: CreateEntryInput): Promise<KnowledgeEntry> {
  return request("/api/entries", { method: "POST", body: input });
}

export async function createStructuredEntry(input: CreateEntryInput): Promise<KnowledgeEntry> {
  return request("/api/entries", { method: "POST", body: input });
}

export async function createProject(input: CreateProjectInput): Promise<KnowledgeEntry> {
  return request("/api/projects", { method: "POST", body: input });
}

export async function archiveEntry(relativePath: string, updates: Pick<EntryMetadata, "project" | "type" | "tags" | "status">): Promise<KnowledgeEntry> {
  return request("/api/archive", { method: "POST", body: { relativePath, updates } });
}

export async function searchEntries(filters: SearchFilters): Promise<KnowledgeEntry[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, String(value));
    }
  }
  return request(`/api/search?${params.toString()}`);
}

export async function getGitStatus(): Promise<GitChange[] | { error: string; fallback: GitChange[] }> {
  return request("/api/git/status");
}

export async function getGitDiff(): Promise<{ diff: string | { error: string; fallback: string } }> {
  return request("/api/git/diff");
}

export async function getGitLog(): Promise<string[] | { error: string; fallback: string[] }> {
  return request("/api/git/log");
}

export async function commitKnowledge(message: string): Promise<{ output: string }> {
  return request("/api/git/commit", { method: "POST", body: { message } });
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }
  return payload as T;
}
