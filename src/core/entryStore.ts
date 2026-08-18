import type { CreateEntryInput, Entry, SearchFilters, Summary } from "./types.js";

interface EntryRow {
  id: string;
  title: string;
  type: string;
  project: string;
  status: string;
  tags: string;
  source: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export async function createEntry(db: D1Database, input: CreateEntryInput): Promise<Entry> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO entries (id, title, type, project, status, tags, source, body, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`
  ).bind(
    id,
    input.title.trim(),
    input.type,
    input.project.trim(),
    input.status,
    JSON.stringify(uniqueClean(input.tags)),
    input.source.trim(),
    input.body.trim(),
    now
  ).run();

  return getEntry(db, id) as Promise<Entry>;
}

export async function updateEntry(db: D1Database, id: string, updates: Partial<CreateEntryInput>): Promise<Entry> {
  const existing = await getEntry(db, id);
  if (!existing) {
    throw new Error(`Entry not found: ${id}`);
  }
  const now = new Date().toISOString();
  const next: Entry = {
    ...existing,
    ...(updates.title !== undefined ? { title: updates.title.trim() } : {}),
    ...(updates.type !== undefined ? { type: updates.type } : {}),
    ...(updates.project !== undefined ? { project: updates.project.trim() } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.tags !== undefined ? { tags: uniqueClean(updates.tags) } : {}),
    ...(updates.source !== undefined ? { source: updates.source.trim() } : {}),
    ...(updates.body !== undefined ? { body: updates.body.trim() } : {}),
    updatedAt: now
  };

  await db.prepare(
    `UPDATE entries SET title = ?2, type = ?3, project = ?4, status = ?5, tags = ?6, source = ?7, body = ?8, updated_at = ?9
     WHERE id = ?1`
  ).bind(
    id,
    next.title,
    next.type,
    next.project,
    next.status,
    JSON.stringify(next.tags),
    next.source,
    next.body,
    next.updatedAt
  ).run();

  return next;
}

export async function deleteEntry(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM entries WHERE id = ?1`).bind(id).run();
}

export async function getEntry(db: D1Database, id: string): Promise<Entry | null> {
  const row = await db.prepare(`SELECT * FROM entries WHERE id = ?1`).bind(id).first<EntryRow>();
  return row ? rowToEntry(row) : null;
}

export async function listEntries(db: D1Database): Promise<Entry[]> {
  const { results } = await db.prepare(`SELECT * FROM entries ORDER BY updated_at DESC`).all<EntryRow>();
  return results.map(rowToEntry);
}

export async function getSummary(db: D1Database): Promise<Summary> {
  const entries = await listEntries(db);
  const projects = [...new Set(entries.map((entry) => entry.project).filter(Boolean))].sort();
  const tags = [...new Set(entries.flatMap((entry) => entry.tags))].sort();
  return { entries, projects, tags };
}

export async function searchEntries(db: D1Database, filters: SearchFilters): Promise<Entry[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const query = filters.query?.trim().toLowerCase();
  if (query) {
    clauses.push(`(lower(title) LIKE ?${params.length + 1} OR lower(body) LIKE ?${params.length + 1} OR lower(tags) LIKE ?${params.length + 1})`);
    params.push(`%${query}%`);
  }
  if (filters.project) {
    clauses.push(`project = ?${params.length + 1}`);
    params.push(filters.project);
  }
  if (filters.type) {
    clauses.push(`type = ?${params.length + 1}`);
    params.push(filters.type);
  }
  if (filters.tag) {
    clauses.push(`lower(tags) LIKE ?${params.length + 1}`);
    params.push(`%"${filters.tag.trim().toLowerCase()}"%`);
  }
  if (filters.status) {
    clauses.push(`status = ?${params.length + 1}`);
    params.push(filters.status);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { results } = await db.prepare(`SELECT * FROM entries ${where} ORDER BY updated_at DESC`).bind(...params).all<EntryRow>();
  return results.map(rowToEntry);
}

function rowToEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    title: row.title,
    type: row.type as Entry["type"],
    project: row.project,
    status: row.status as Entry["status"],
    tags: JSON.parse(row.tags) as string[],
    source: row.source,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function uniqueClean(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim().toLowerCase()).filter(Boolean))];
}
