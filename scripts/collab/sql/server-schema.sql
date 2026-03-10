PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS committed_events (
  committed_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  user_id TEXT,
  partitions TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  meta TEXT NOT NULL,
  created INTEGER NOT NULL
);
