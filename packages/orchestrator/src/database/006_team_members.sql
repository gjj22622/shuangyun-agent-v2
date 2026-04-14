CREATE TABLE IF NOT EXISTS team_members (
  member_id TEXT PRIMARY KEY,
  alias TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'operator', 'admin')),
  email TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'archived')),
  joined_at TEXT NOT NULL,
  last_seen_at TEXT,
  notes_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS member_quotas (
  member_id TEXT PRIMARY KEY,
  daily_usd REAL,
  weekly_usd REAL,
  monthly_usd REAL,
  task_count_daily_target INTEGER,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES team_members(member_id) ON DELETE CASCADE
);

ALTER TABLE cost_ledger ADD COLUMN member_id TEXT;
ALTER TABLE cost_ledger ADD COLUMN task_id TEXT;

CREATE INDEX IF NOT EXISTS idx_cost_ledger_member_date ON cost_ledger(member_id, date);
CREATE INDEX IF NOT EXISTS idx_cost_ledger_task_id ON cost_ledger(task_id);

CREATE VIEW IF NOT EXISTS member_activity_log AS
SELECT
  tm.member_id,
  tm.alias,
  t.task_id,
  t.skill_id,
  t.client_id,
  t.created_at AS started_at,
  t.completed_at AS ended_at,
  json_extract(o.review_json, '$.verdict') AS verdict,
  t.status,
  COALESCE(cl.estimated_usd, 0) AS estimated_usd,
  COALESCE(cl.input_tokens, 0) AS input_tokens,
  COALESCE(cl.output_tokens, 0) AS output_tokens,
  substr(COALESCE(o.content_body, ''), 1, 120) AS content_preview
FROM tasks t
LEFT JOIN outputs o ON o.task_id = t.task_id
LEFT JOIN (
  SELECT
    task_id,
    member_id,
    SUM(estimated_usd) AS estimated_usd,
    SUM(input_tokens) AS input_tokens,
    SUM(output_tokens) AS output_tokens
  FROM cost_ledger
  WHERE task_id IS NOT NULL AND member_id IS NOT NULL
  GROUP BY task_id, member_id
) cl ON cl.task_id = t.task_id
LEFT JOIN team_members tm ON tm.member_id = cl.member_id;
