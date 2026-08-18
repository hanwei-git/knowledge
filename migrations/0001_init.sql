CREATE TABLE entries (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('troubleshooting','decision','reference','runbook','note')),
  project     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL CHECK (status IN ('draft','active','archived')) DEFAULT 'draft',
  tags        TEXT NOT NULL DEFAULT '[]',
  source      TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX idx_entries_project    ON entries(project);
CREATE INDEX idx_entries_type       ON entries(type);
CREATE INDEX idx_entries_status     ON entries(status);
CREATE INDEX idx_entries_updated_at ON entries(updated_at DESC);
