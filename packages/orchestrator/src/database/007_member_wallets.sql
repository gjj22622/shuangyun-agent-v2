CREATE TABLE IF NOT EXISTS member_wallets (
  member_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL,
  lifetime_earned INTEGER NOT NULL DEFAULT 0,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL CHECK (tier IN ('Bronze', 'Silver', 'Gold', 'Platinum')),
  tier_updated_at TEXT NOT NULL,
  last_grant_at TEXT,
  last_daily_bonus_at TEXT,
  current_streak_days INTEGER NOT NULL DEFAULT 0,
  last_streak_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES team_members(member_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  tx_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  reason TEXT NOT NULL,
  ref_task_id TEXT,
  multiplier REAL NOT NULL DEFAULT 1.0,
  original_amount INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES team_members(member_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_member_created ON wallet_transactions(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tier_rules (
  tier TEXT PRIMARY KEY CHECK (tier IN ('Bronze', 'Silver', 'Gold', 'Platinum')),
  threshold INTEGER NOT NULL,
  daily_cap INTEGER NOT NULL,
  icon TEXT NOT NULL,
  display_name TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ramp_up_config (
  id TEXT PRIMARY KEY,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  multiplier REAL NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

INSERT OR IGNORE INTO tier_rules (
  tier, threshold, daily_cap, icon, display_name, updated_at, updated_by
) VALUES
  ('Bronze', 0, 5000, '🥉', '銅牌夥伴', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'system'),
  ('Silver', 5000, 8000, '🥈', '銀牌夥伴', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'system'),
  ('Gold', 20000, 15000, '🥇', '金牌夥伴', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'system'),
  ('Platinum', 50000, 30000, '💎', '白金夥伴', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'system');

INSERT OR IGNORE INTO ramp_up_config (
  id, start_date, end_date, multiplier, reason, created_at, created_by
) VALUES (
  'rampup_initial_001',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+7 days'),
  2.0,
  '初始 demo 七天 ramp-up',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'system'
);
