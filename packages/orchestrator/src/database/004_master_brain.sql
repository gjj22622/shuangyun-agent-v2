CREATE TABLE IF NOT EXISTS master_cases (
  case_id TEXT PRIMARY KEY,
  industry TEXT NOT NULL,
  channel TEXT NOT NULL,
  summary TEXT NOT NULL,
  brief TEXT NOT NULL,
  what_worked TEXT NOT NULL,
  what_failed TEXT,
  takeaway TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playbooks (
  playbook_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applicable_when_json TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  expected_outcomes_json TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_master_cases_industry ON master_cases(industry);
CREATE INDEX IF NOT EXISTS idx_master_cases_channel ON master_cases(channel);
CREATE INDEX IF NOT EXISTS idx_playbooks_name ON playbooks(name);
