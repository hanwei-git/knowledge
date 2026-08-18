export type EntryType = "troubleshooting" | "decision" | "reference" | "runbook" | "note";
export type EntryStatus = "draft" | "active" | "archived";

export interface Entry {
  id: string;
  title: string;
  type: EntryType;
  project: string;
  tags: string[];
  status: EntryStatus;
  source: string;
  body: string;
  createdAt: string;
  updatedAt: string;
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

export interface Summary {
  entries: Entry[];
  projects: string[];
  tags: string[];
}
