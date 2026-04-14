# Google Apps Script Webhook 部署 SOP

## 一次性設定（10 分鐘）

### 1. 建立 Apps Script 專案

在 Google Drive 建立新的 Apps Script 專案，名稱可用 `shuangyun-google-forms-webhook`。

### 2. 貼 `Code.gs` 與 `appsscript.json`

把 [Code.gs](/C:/Users/gjj22/OneDrive/双云AI轉型教育訓練/09_双云Agent應用/apps-script/Code.gs) 內容貼進專案，並用 [appsscript.json](/C:/Users/gjj22/OneDrive/双云AI轉型教育訓練/09_双云Agent應用/apps-script/appsscript.json) 覆蓋 manifest。

### 3. 設定 Script Properties

在 `Project Settings` -> `Script properties` 設定：

- `GOOGLE_WORKSPACE_FOLDER_ID`
- `SHUANGYUN_WEBHOOK_SECRET`

### 4. 部署為 Web App

點 `Deploy` -> `New deployment`，類型選 `Web app`。

- Execute as: `Me`
- Who has access: `Anyone with the link`

部署後複製 Web App URL。

### 5. 把 URL 與 Secret 寫進 `.env`

在本機 `.env` 或 Zeabur env 寫入：

- `GOOGLE_APPS_SCRIPT_WEBAPP_URL=<你的 Web App URL>`
- `GOOGLE_APPS_SCRIPT_WEBHOOK_SECRET=<和 Script Properties 相同的 secret>`

## 驗證部署是否成功

### 1. 跑 onboarding sample

```powershell
npm run onboard-sample
```

應該看到 client 被建立。之後查 `npm run status` 或 API 時，該 client 會帶真實的 `googleFormUrl` / `googleSheetId`，不是 `stub://...`。

### 2. 跑 verify-form-integration

```powershell
npm run verify-form-integration -- <clientId>
```

應該看到：

- 一次 demo task 的 `outputId`
- 寫進 sheet 的 `formRowId`
- feedback 數量
- 最後一行報告：`create=ok / write_output=ok / list_feedback=ok / total_feedbacks=N`

## 常見錯誤

| 錯誤訊息 | 原因 | 解法 |
|---|---|---|
| `Apps Script create_brand_form failed: 401` | webhook secret 對不上 | 確認 `.env` 與 Script Properties 的 secret 一樣 |
| `Apps Script write_output failed: 500` | sheet 沒有 `outputs` 分頁或 Apps Script 執行出錯 | 第一次會自動建立 `outputs`，重跑一次；若仍失敗就看 Apps Script execution log |
| `googleSheetId is null` | 還在 stub 模式 | 把 `GOOGLE_APPS_SCRIPT_WEBAPP_URL` 寫進 `.env` 後重跑 onboarding |

## 補充

- Webhook secret 目前透過 query string 傳入 Apps Script，因為 `doPost(e)` 對自訂 header 不友善。
- `write_output` 會把每次產出追加到 `outputs` 分頁。
- `list_feedback` 會從 Form responses 主分頁讀回客戶提交內容，再由 Node 端匯入 SQLite。
