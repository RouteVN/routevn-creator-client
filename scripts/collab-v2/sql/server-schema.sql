PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS committed_events (
  committed_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  partitions TEXT NOT NULL,
  event TEXT NOT NULL,
  canonical TEXT NOT NULL,
  status_updated_at INTEGER NOT NULL
);
