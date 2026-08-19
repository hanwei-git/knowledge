import type { CreateEntryInput, Entry, Summary } from "./types.js";

interface EntryRow {
  id: string;
  title: string;
  type: string;
  body: string;
  annotation: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export async function createEntry(db: D1Database, input: CreateEntryInput): Promise<Entry> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO entries (id, title, type, body, annotation, tags, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`
  ).bind(
    id,
    input.title.trim(),
    input.type,
    input.body.trim(),
    input.annotation.trim(),
    JSON.stringify(uniqueClean(input.tags)),
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
    ...(updates.body !== undefined ? { body: updates.body.trim() } : {}),
    ...(updates.annotation !== undefined ? { annotation: updates.annotation.trim() } : {}),
    ...(updates.tags !== undefined ? { tags: uniqueClean(updates.tags) } : {}),
    updatedAt: now
  };

  await db.prepare(
    `UPDATE entries SET title = ?2, body = ?3, annotation = ?4, tags = ?5, updated_at = ?6
     WHERE id = ?1`
  ).bind(
    id,
    next.title,
    next.body,
    next.annotation,
    JSON.stringify(next.tags),
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
  const tags = [...new Set(entries.flatMap((entry) => entry.tags))].sort();
  return { entries, tags };
}

function rowToEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    title: row.title,
    type: row.type as Entry["type"],
    body: row.body,
    annotation: row.annotation,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function uniqueClean(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim().toLowerCase()).filter(Boolean))];
}
