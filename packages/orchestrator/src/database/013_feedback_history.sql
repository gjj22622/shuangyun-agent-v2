CREATE TABLE IF NOT EXISTS feedback_history (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  output_summary TEXT NOT NULL,
  score INTEGER,
  user_edits TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_history_client_type ON feedback_history(client_id, task_type);
CREATE INDEX IF NOT EXISTS idx_feedback_history_created ON feedback_history(created_at);
