-- 補齊缺少的外鍵索引，確保 20 品牌規模下查詢效能
CREATE INDEX IF NOT EXISTS idx_outputs_client_id ON outputs(client_id);
CREATE INDEX IF NOT EXISTS idx_outputs_task_id ON outputs(task_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_output_id ON feedbacks(output_id);
CREATE INDEX IF NOT EXISTS idx_tasks_client_id ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_skill_id ON tasks(skill_id);
CREATE INDEX IF NOT EXISTS idx_traces_client_id ON traces(client_id);
CREATE INDEX IF NOT EXISTS idx_traces_task_id ON traces(task_id);
CREATE INDEX IF NOT EXISTS idx_brand_dataroom_client_id ON brand_dataroom(client_id);
CREATE INDEX IF NOT EXISTS idx_cost_ledger_actor_alias ON cost_ledger(actor_alias);
CREATE INDEX IF NOT EXISTS idx_cost_ledger_created_at ON cost_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_member_id ON wallet_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_pending_prompt_changes_brain_id ON pending_prompt_changes(brain_id);
