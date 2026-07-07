export type EntryType = "project" | "troubleshooting" | "decision" | "reference" | "runbook" | "note";
export type EntryStatus = "draft" | "active" | "archived";

export interface EntryMetadata {
  title: string;
  type: EntryType;
  project: string;
  tags: string[];
  status: EntryStatus;
  createdAt: string;
  updatedAt: string;
  source: string;
}

export interface KnowledgeEntry {
  relativePath: string;
  absolutePath: string;
  metadata: EntryMetadata;
  body: string;
  excerpt: string;
}

export interface ProjectWiki {
  slug: string;
  title: string;
  summary: string;
  index?: KnowledgeEntry;
  groups: Record<EntryType, KnowledgeEntry[]>;
  recent: KnowledgeEntry[];
}

export interface SearchFilters {
  query?: string;
  project?: string;
  type?: EntryType | "";
  tag?: string;
  status?: EntryStatus | "";
}

export interface CreateEntryInput {
  title: string;
  type: EntryType;
  project: string;
  tags: string[];
  status: EntryStatus;
  source: string;
  body: string;
}

export interface CreateProjectInput {
  slug: string;
  title: string;
  summary: string;
}
