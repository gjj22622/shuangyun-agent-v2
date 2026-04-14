-- Migration 010：品牌文件資料室（brand-brain-document-builder change）
-- 儲存上傳的品牌相關文件純文字，供 Brand Brain Builder Skill 萃取生成品牌腦。

CREATE TABLE IF NOT EXISTS brand_dataroom (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK(doc_type IN ('business_dev','weekly_meeting','deep_search','founder_personality','brand_boundary')),
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  content_length INTEGER NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(client_id)
);

CREATE INDEX IF NOT EXISTS idx_dataroom_client ON brand_dataroom(client_id);
CREATE INDEX IF NOT EXISTS idx_dataroom_client_type ON brand_dataroom(client_id, doc_type);
