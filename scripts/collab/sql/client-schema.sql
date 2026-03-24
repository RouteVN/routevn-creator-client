PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS local_drafts (
  draft_clock INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  partition TEXT NOT NULL,
  type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  payload_compression TEXT DEFAULT NULL,
  client_ts INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS committed_events (
  committed_id INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT,
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

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
