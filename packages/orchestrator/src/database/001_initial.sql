PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS clients (
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  google_form_url TEXT,
  google_sheet_id TEXT,
  dataroom_path TEXT NOT NULL,
  subscription_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brand_brains (
  brain_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  strategy_notes_json TEXT NOT NULL,
  agents_json TEXT NOT NULL,
  dataroom_path TEXT NOT NULL,
  version INTEGER NOT NULL,
  last_updated TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(client_id)
);

CREATE TABLE IF NOT EXISTS agents (
  agent_id TEXT PRIMARY KEY,
  brain_id TEXT NOT NULL,
  role TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  dataroom_refs_json TEXT NOT NULL,
  responsibilities_json TEXT NOT NULL,
  FOREIGN KEY (brain_id) REFERENCES brand_brains(brain_id)
);

CREATE TABLE IF NOT EXISTS skills (
  skill_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  category TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT NOT NULL,
  input_schema_json TEXT NOT NULL,
  output_schema_json TEXT NOT NULL,
  blocks_json TEXT NOT NULL,
  is_shared INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  due_at TEXT,
  completed_at TEXT,
  assignee TEXT,
  progress REAL NOT NULL,
  result_form_row_id TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(client_id),
  FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
);

CREATE TABLE IF NOT EXISTS outputs (
  output_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content_body TEXT NOT NULL,
  asset_urls_json TEXT NOT NULL,
  skill_used TEXT NOT NULL,
  review_json TEXT,
  status TEXT NOT NULL,
  form_row_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(task_id),
  FOREIGN KEY (client_id) REFERENCES clients(client_id)
);

CREATE TABLE IF NOT EXISTS feedbacks (
  feedback_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  output_id TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  content TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  applied_to_brain INTEGER NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(client_id),
  FOREIGN KEY (output_id) REFERENCES outputs(output_id)
);

CREATE TABLE IF NOT EXISTS traces (
  trace_id TEXT PRIMARY KEY,
  task_id TEXT,
  client_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  step_name TEXT NOT NULL,
  input_summary TEXT NOT NULL,
  output_summary TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  error_code TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(task_id),
  FOREIGN KEY (client_id) REFERENCES clients(client_id)
);

CREATE TABLE IF NOT EXISTS pending_prompt_changes (
  change_id TEXT PRIMARY KEY,
  brain_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  proposed_prompt TEXT NOT NULL,
  rationale TEXT NOT NULL,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  FOREIGN KEY (brain_id) REFERENCES brand_brains(brain_id)
);
