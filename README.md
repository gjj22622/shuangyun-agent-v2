# 双云 AI Agent V2 — 腦手工作流平台

## 一句話

腦討論 → 命令手 → 手產出 → 腦 check → 交付真人。

## 核心簡化（V1 → V2）

V1 問題：太多頁面、太多概念（brain-meeting / brain-briefing / command-assembler / reference-injection / workflow-engine / dispatch 分不清楚）。

V2 只有三個概念：

| 概念 | 說明 |
|---|---|
| **腦** | .md 文件，可上傳/編輯。腦跟腦可以討論（AI call）→ 產出結論（指令） |
| **手** | .md 文件（Skill），可上傳/編輯。接收腦的指令 → 產出內容（AI call）→ 可串外部工具（Connector） |
| **工作流** | 腦和手的組合，每個品牌可儲存自己的日常工作流 |

## 流程

```
1. 腦↔腦討論（可選，花 token）→ 產出指令
2. 指令 → 手執行（花 token）→ 產出內容
3. 內容 → 腦 check（可選，花 token）→ 通過/退回
4. 通過 → 交付真人（或自動發佈到 IG/FB）
```

## 功能

### 腦/手資料庫
- 上傳 .md 文件（拖放或貼文字）
- 新增/編輯/刪除
- 標記 layer: brain 或 hand
- 從 Google Drive 同步

### 工作流建構器
- 選腦 + 選手 → 組合成工作流
- 每個品牌儲存自己的工作流
- 一鍵執行：腦討論 → 手執行 → 腦 check → 交付

### 品牌管理
- 新增品牌客戶
- 每品牌有自己的工具箱（API Key）
- 每品牌有自己的工作流集合

## 技術

從 V1 複製可用模組，不重寫：
- shared-types（Zod schemas）
- brain package（三腦融合）
- connectors/（DALL-E / Flux / Runway / IG / FB / Meta Ads）
- auth/（token / cost-ledger / wallet）
- integrations/（anthropic / gdrive-skill-sync）
- runtime/（command-assembler / brain-doc-parser / skill-doc-parser / reference-injection）

新寫的只有：
- 簡化版 server.ts（少一半路由）
- 簡化版前端（3 個頁面而不是 12 個）
- 簡化版 workflow engine

## 頁面（只有 3 個 + 登入）

| 頁面 | 路徑 | 功能 |
|---|---|---|
| 腦手資料庫 | `/library` | 上傳/新增/編輯/刪除 腦和手 |
| 工作流 | `/workflows` | 建構+執行+歷史 |
| 品牌管理 | `/brands` | 客戶列表+工具箱+產出歷史 |
