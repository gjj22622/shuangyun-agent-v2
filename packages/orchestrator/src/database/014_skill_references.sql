CREATE TABLE IF NOT EXISTS skill_references (
  skill_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (skill_id, filename),
  FOREIGN KEY (skill_id) REFERENCES skills(skill_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_references_skill_id ON skill_references(skill_id);

CREATE TABLE IF NOT EXISTS skill_sync_state (
  skill_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  synced_at TEXT NOT NULL,
  archived_at TEXT,
  PRIMARY KEY (skill_id, source)
);

CREATE INDEX IF NOT EXISTS idx_skill_sync_state_source ON skill_sync_state(source, archived_at);
