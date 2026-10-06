CREATE TABLE IF NOT EXISTS applications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  company    TEXT NOT NULL,
  role       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'applied'
             CHECK (status IN ('wishlist','applied','interview','offer','rejected')),
  deadline   TEXT,               -- ISO date (YYYY-MM-DD), optional
  link       TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Single-row table: this is a one-user app, so the profile always has id = 1.
CREATE TABLE IF NOT EXISTS profile (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  name       TEXT NOT NULL DEFAULT '',
  skills     TEXT NOT NULL DEFAULT '',   -- comma-separated
  target_roles TEXT NOT NULL DEFAULT '', -- comma-separated
  experience TEXT NOT NULL DEFAULT 'entry',
  summary    TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO profile (id) VALUES (1);

-- Successful empty snapshots replace old jobs, so removed listings disappear.
CREATE TABLE IF NOT EXISTS job_source_cache (
  source_id TEXT PRIMARY KEY,
  jobs_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

-- Search discoveries are unverified leads, retained for at most 24 hours.
CREATE TABLE IF NOT EXISTS discovered_jobs (
  url TEXT PRIMARY KEY,
  job_json TEXT NOT NULL,
  discovered_at INTEGER NOT NULL
);
