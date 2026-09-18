-- SLA Monitoring Dashboard - D1 (SQLite) schema
-- One row per cleaned, deduplicated health check.

CREATE TABLE IF NOT EXISTS checks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id     TEXT    NOT NULL,
  service_name   TEXT    NOT NULL,
  ts_utc         TEXT    NOT NULL,   -- normalized ISO-8601 UTC, e.g. 2025-05-13T12:45:00Z
  status_code    INTEGER NOT NULL,  -- 200/500/502/503, or NULL-equivalent -1 for unreachable (was 999)
  is_success     INTEGER NOT NULL,  -- 1 if status_code == 200, else 0. Precomputed so queries don't repeat the rule.
  latency_ms     REAL,              -- normalized to milliseconds; NULL if missing/unrecoverable
  agent          TEXT    NOT NULL,
  region         TEXT    NOT NULL,
  upload_batch   TEXT    NOT NULL,  -- which upload this row came from, for traceability
  UNIQUE(service_id, ts_utc, agent) -- de-dupes exact repeat checks (same agent re-reporting same slot)
);

CREATE INDEX IF NOT EXISTS idx_checks_service_ts ON checks(service_id, ts_utc);
CREATE INDEX IF NOT EXISTS idx_checks_ts ON checks(ts_utc);

-- Rows the cleaner couldn't safely place in `checks` (unparseable timestamp, etc).
-- Kept instead of silently dropped, so the README's "data findings" claims are auditable.
CREATE TABLE IF NOT EXISTS rejected_rows (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_batch   TEXT    NOT NULL,
  raw_row        TEXT    NOT NULL,
  reason         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS uploads (
  batch_id       TEXT PRIMARY KEY,
  filename       TEXT NOT NULL,
  uploaded_at    TEXT NOT NULL,
  row_count      INTEGER NOT NULL,
  rejected_count INTEGER NOT NULL
);
