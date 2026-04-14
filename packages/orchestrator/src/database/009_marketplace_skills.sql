CREATE TABLE IF NOT EXISTS marketplace_skills (
  skill_id TEXT PRIMARY KEY,
  publisher_alias TEXT NOT NULL,
  publisher_member_id TEXT,
  category TEXT NOT NULL DEFAULT 'content_writing',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prompt_preview TEXT,
  install_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  version TEXT NOT NULL DEFAULT '1.0.0',
  published_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketplace_skills_category ON marketplace_skills(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_skills_status ON marketplace_skills(status);
