CREATE TABLE IF NOT EXISTS cost_ledger (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  actor_alias TEXT NOT NULL,
  action TEXT NOT NULL,
  estimated_usd REAL NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cost_ledger_date ON cost_ledger(date);
