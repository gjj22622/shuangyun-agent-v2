# V2 双云 AI Agent 平台

## 核心流程
腦討論 → 命令手 → 手產出 → 腦 check → 交付真人

## 三個概念
- 腦：.md 文件，可討論（AI call）→ 產出指令
- 手：.md 文件（Skill），接指令 → 產出內容 → 可串 Connector
- 工作流：腦+手的組合，每品牌各自的日常自動化

## 三個頁面
- /library — 腦手資料庫（上傳/新增/編輯/刪除）
- /workflows — 工作流建構+執行
- /brands — 品牌管理+工具箱+產出

## Stack
TypeScript monorepo · Node 24 · SQLite · SSR+vanilla JS · Zeabur

## 規則
繁中 · 不加 npm 依賴 · 不要問直接做 · push 後 docker compose up -d --build · dev/main 雙分支
