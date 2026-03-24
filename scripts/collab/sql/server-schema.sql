PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS committed_events (
  committed_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  user_id TEXT,
  partition TEXT NOT NULL,
  type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  payload_compression TEXT DEFAULT NULL,
  client_ts INTEGER NOT NULL,
  server_ts INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
