CREATE TABLE entries_new (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  annotation  TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

INSERT INTO entries_new (id, title, body, annotation, tags, created_at, updated_at)
  SELECT id, title, body, annotation, tags, created_at, updated_at FROM entries;

DROP TABLE entries;
ALTER TABLE entries_new RENAME TO entries;

CREATE INDEX idx_entries_updated_at ON entries(updated_at DESC);
