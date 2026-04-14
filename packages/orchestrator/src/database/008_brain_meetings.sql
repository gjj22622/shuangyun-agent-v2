CREATE TABLE IF NOT EXISTS brain_meetings (
  meeting_id TEXT PRIMARY KEY,
  task_id TEXT,
  client_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'consultation',
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS brain_meeting_messages (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  role TEXT NOT NULL,
  round INTEGER NOT NULL DEFAULT 0,
  phase TEXT NOT NULL,
  content TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (meeting_id) REFERENCES brain_meetings(meeting_id)
);

CREATE INDEX IF NOT EXISTS idx_brain_meeting_messages_meeting ON brain_meeting_messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_brain_meetings_client ON brain_meetings(client_id);
