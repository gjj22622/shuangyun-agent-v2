-- Migration 003：將 traces.client_id 改為可 NULL，以支援 auth_audit 等沒有自然 client 綁定的稽核事件。
-- SQLite 不支援直接放寬 NOT NULL 約束，因此用 rebuild swap 的方式重建 traces 表。

PRAGMA foreign_keys = OFF;

CREATE TABLE traces_v2 (
  trace_id TEXT PRIMARY KEY,
  task_id TEXT,
  client_id TEXT,
  phase TEXT NOT NULL,
  step_name TEXT NOT NULL,
  input_summary TEXT NOT NULL,
  output_summary TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  error_code TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(client_id)
);

INSERT INTO traces_v2 (
  trace_id, task_id, client_id, phase, step_name, input_summary, output_summary, started_at, ended_at, error_code
)
SELECT
  trace_id, task_id, client_id, phase, step_name, input_summary, output_summary, started_at, ended_at, error_code
FROM traces;

DROP TABLE traces;
ALTER TABLE traces_v2 RENAME TO traces;

PRAGMA foreign_keys = ON;
