import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Actor, BrandBrain, BrandDataroomDoc, BrandDataroomDocType, Client, MemberNote, MemberQuota, Output, Task, TeamMember, TierRule, TraceLog, Wallet } from "@shuangyun/shared-types";
import { brandDataroomDocTypeSchema } from "@shuangyun/shared-types";
import { z } from "zod";
import { createOnboarding, createTaskAndDispatch, importMarkdown, runDemoTask, runSampleOnboarding } from "./app.js";
import { writeAuthAuditTrace } from "./auth/audit.js";
import { appendEntry, DailyBudgetExceededError, MemberQuotaExceededError, getMemberSnapshot, getTodaySnapshot } from "./auth/cost-ledger.js";
import { attachRequestContext, authenticateRequest, getRequestIp, requireAuth, requireCostConfirmation, sendErrorResponse } from "./auth/middleware.js";
import { ensureTeamMembersFromTokens, MemberArchivedError, memberIdFromAlias } from "./auth/team-members-bootstrap.js";
import {
  ensureWalletForAllMembers,
  ensureWalletForMember,
  getCurrentRampUp,
  getTaipeiWeekSinceIso,
  grantTokens,
  InsufficientTokenBalanceError,
  penaltyTokens,
  TierDailyCapExceededError
} from "./auth/wallet.js";
import { parsePlatformAccessTokens } from "./auth/token-registry.js";
import type { GoogleFormsAdapter } from "./integrations/google-forms.js";
import type { RepositoryBundle } from "./repositories/bundle.js";
import {
  createStrategyBrain,
  loadMasterBrain,
  mergeThreeBrains,
  type MasterBrainTaskAttrs
} from "@shuangyun/brain";
import { assembleBrandBrain, buildBrandBrainFromDocs, NoDocumentsUploadedError, RequiredDocumentMissingError } from "./runtime/brand-brain-builder.js";
import { runBrainMeeting } from "./runtime/brain-meeting.js";
import { resolveReferences } from "./runtime/reference-injection.js";
import { renderAdminBrains } from "./web/admin-templates.js";
import { renderBrandBrainBuilder } from "./web/brand-brain-builder-templates.js";
import { renderDemoCompare, renderDemoConsole } from "./web/demo-templates.js";
import { renderMarketplace } from "./web/marketplace-templates.js";
import { renderMembersOverview, type MemberOverviewRow } from "./web/member-templates.js";
import { renderLeaderboard } from "./web/wallet-templates.js";
import { renderWorkflowList, renderWorkflowBuilder } from "./web/workflow-templates.js";

type ClientOutputStats = {
  total: number;
  thisWeek: number;
  pendingReview: number;
  published: number;
};

const MAX_BRAND_DATAROOM_BYTES = 50 * 1024;

const brandBrainUploadSchema = z.object({
  docs: z
    .array(
      z.object({
        docType: brandDataroomDocTypeSchema,
        filename: z.string().min(1),
        content: z.string()
      })
    )
    .min(1)
});

const brandBrainConfirmSchema = z.object({
  agents: z.object({
    boss: z.object({
      systemPrompt: z.string().min(1),
      responsibilities: z.array(z.string().min(1)).min(1),
      dataroomRefs: z.array(brandDataroomDocTypeSchema).min(1)
    }),
    manager: z.object({
      systemPrompt: z.string().min(1),
      responsibilities: z.array(z.string().min(1)).min(1),
      dataroomRefs: z.array(brandDataroomDocTypeSchema).min(1)
    }),
    window: z.object({
      systemPrompt: z.string().min(1),
      responsibilities: z.array(z.string().min(1)).min(1),
      dataroomRefs: z.array(brandDataroomDocTypeSchema).min(1)
    }),
    brand: z.object({
      systemPrompt: z.string().min(1),
      responsibilities: z.array(z.string().min(1)).min(1),
      dataroomRefs: z.array(brandDataroomDocTypeSchema).min(1)
    })
  }),
  strategyNotes: z.array(z.string().min(1)).min(1)
});

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body, null, 2));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8").trim();
  return body ? JSON.parse(body) : {};
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function formatDateTime(value: string | null): string {
  if (!value) return "未設定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function previewText(value: string, length = 84): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "尚無內容";
  return compact.length > length ? `${compact.slice(0, length)}...` : compact;
}

function summarizeOutputs(outputs: Output[]): ClientOutputStats {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return outputs.reduce<ClientOutputStats>(
    (summary, output) => {
      summary.total += 1;
      if (new Date(output.createdAt).getTime() >= oneWeekAgo) summary.thisWeek += 1;
      if (output.status === "passed") summary.published += 1;
      if (output.status === "draft" || output.status === "reviewing") summary.pendingReview += 1;
      return summary;
    },
    { total: 0, thisWeek: 0, pendingReview: 0, published: 0 }
  );
}

function renderMarkdownSource(markdown: string): string {
  return `<pre class="code-block">${escapeHtml(markdown)}</pre>`;
}

function renderSharedStyles(): string {
  // 新主題：預設淺色 + html.dark 深色切換。保留所有舊 CSS class name 以向後相容。
  return `
    <script>(function(){var s=localStorage.getItem("sy-theme");if((s||"light")==="dark")document.documentElement.classList.add("dark")})()</script>
    <style>
    :root{--bg:#fafafa;--panel:#ffffff;--panel-border:#e2e8f0;--ink:#0f172a;--muted:#94a3b8;--accent-a:#0ea5e9;--accent-b:#f59e0b;--accent-c:#dc2626}
    *{box-sizing:border-box}body{margin:0;color:var(--ink);font-family:-apple-system,"PingFang TC","Noto Sans TC",system-ui,sans-serif;background:radial-gradient(ellipse at top left,rgba(239,68,68,.04) 0%,transparent 50%),radial-gradient(ellipse at top right,rgba(56,189,248,.05) 0%,transparent 50%),linear-gradient(180deg,#fafafa 0%,#f1f5f9 100%);min-height:100vh}
    a{color:inherit}.wrap{width:min(1180px,calc(100vw - 40px));margin:0 auto;padding:28px 0 48px}.hero,.panel,.sheet,.record-card,.task-card{background:var(--panel);border:1px solid var(--panel-border);border-radius:24px;box-shadow:0 4px 16px rgba(15,23,42,.06)}
    .hero{padding:30px;display:grid;grid-template-columns:1.4fr 1fr;gap:24px;margin-bottom:22px}.panel,.sheet,.record-card,.task-card{padding:24px}.eyebrow{color:var(--accent-a);font-weight:700;letter-spacing:.08em;font-size:12px;text-transform:uppercase}
    h1{margin:10px 0 14px;font-size:clamp(34px,5vw,58px);line-height:.95}h2{margin:0 0 10px;font-size:24px}h3{margin:0;font-size:18px}.lead,.muted{color:var(--muted)}
    .topbar,.page-header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px}.nav,.cta-row,.breadcrumbs{display:flex;gap:10px;flex-wrap:wrap}.nav a,.btn{border-radius:999px;text-decoration:none}.nav a{padding:10px 14px;border:1px solid #e2e8f0;color:var(--muted);background:#fff}.nav a.active{color:#fff;border-color:rgba(239,68,68,.5);background:linear-gradient(135deg,#dc2626,#ef4444);box-shadow:0 4px 14px rgba(239,68,68,.3)}
    .btn{border:0;padding:12px 18px;font-weight:700;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.btn:disabled{opacity:.72;cursor:wait}.btn-primary{background:linear-gradient(135deg,#dc2626,#ef4444 50%,#0ea5e9);box-shadow:0 4px 14px rgba(239,68,68,.25)}.btn-secondary{background:linear-gradient(135deg,#0f766e,#14b8a6)}.btn-tertiary{background:#f8fafc;border:1px solid #e2e8f0;color:var(--ink)}.btn-link{color:var(--accent-a);font-weight:700;text-decoration:none}
    .stats,.metric-grid,.meta-grid{display:grid;gap:12px}.stats{grid-template-columns:repeat(2,1fr)}.metric-grid{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:22px}.meta-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:16px}.stat,.metric,.meta-item,.sheet-card{padding:16px;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0}.stat strong,.metric strong{display:block;font-size:30px;margin-top:6px}
    .grid{display:grid;grid-template-columns:1.2fr 1fr;gap:22px}.client-list,.record-list,.task-list,.overview-grid,.trace-list,.agent-list,.note-list{display:grid;gap:14px;margin-top:18px}.client-list{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}.overview-grid{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.database-layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:22px;align-items:start}.split,.section-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
    .pill,.subtle-pill,.status{display:inline-flex;padding:4px 10px;border-radius:999px;font-size:12px}.pill{background:rgba(245,158,11,.1);color:#b45309}.subtle-pill{color:#0369a1;background:rgba(14,165,233,.1);border:1px solid rgba(14,165,233,.3)}.status{border:1px solid transparent;text-transform:capitalize}.status-done,.status-passed{color:#047857;background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.3)}.status-in_progress,.status-reviewing{color:#0369a1;background:rgba(14,165,233,.1);border-color:rgba(14,165,233,.3)}.status-pending,.status-overdue,.status-cancelled,.status-draft,.status-rejected{color:#b45309;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3)}
    table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:12px 10px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:14px;vertical-align:top}th{color:var(--muted);font-weight:600}
    code,.mono{font-family:"Cascadia Code","SFMono-Regular",monospace;background:#f1f5f9;padding:2px 6px;border-radius:8px}.stack,.field{display:grid;gap:12px}.field-full{grid-column:1 / -1}label{font-weight:700;font-size:14px}
    input,textarea,select{width:100%;border-radius:16px;border:1px solid #cbd5e1;background:#fff;color:var(--ink);padding:14px 16px;font:inherit}input:focus,textarea:focus,select:focus{outline:none;border-color:#0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,.15)}textarea{min-height:120px;resize:vertical}input::placeholder,textarea::placeholder{color:#94a3b8}
    .checkbox-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}.checkbox-pill{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:16px;border:1px solid #e2e8f0;background:#fff}.checkbox-pill input{width:auto;margin:0;padding:0;accent-color:var(--accent-a)}
    .submit-row{display:flex;justify-content:flex-end}.result-panel{display:none;margin-top:22px}.result-panel.is-visible{display:block}.result-panel.success{border-color:rgba(16,185,129,.4)}.result-panel.error{border-color:rgba(239,68,68,.4)}.result-list{display:grid;gap:10px}.result-item,.trace-item,.agent-item,.note-item{padding:14px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0}
    .breadcrumbs{margin-bottom:16px;font-size:14px}.breadcrumbs a{color:var(--accent-a);text-decoration:none}.code-block{overflow-x:auto;white-space:pre-wrap;line-height:1.65;padding:18px;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0;margin:0;color:#0f172a}.empty-state{padding:18px;border-radius:18px;border:1px dashed #cbd5e1;color:var(--muted);text-align:center}
    .theme-toggle{position:fixed;top:16px;right:16px;z-index:999;width:40px;height:40px;border-radius:12px;background:#fff;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    /* DARK MODE */
    html.dark{--bg:#020617;--panel:rgba(15,23,42,.7);--panel-border:rgba(51,65,85,.6);--ink:#f1f5f9;--muted:#64748b;--accent-a:#38bdf8;--accent-b:#fbbf24;--accent-c:#ef4444}
    html.dark body{background:radial-gradient(ellipse at top left,rgba(239,68,68,.08) 0%,transparent 50%),radial-gradient(ellipse at top right,rgba(56,189,248,.1) 0%,transparent 50%),linear-gradient(135deg,#020617 0%,#0f172a 50%,#020617 100%)}
    html.dark .hero,html.dark .panel,html.dark .sheet,html.dark .record-card,html.dark .task-card{background:var(--panel);border-color:var(--panel-border);box-shadow:0 4px 16px rgba(0,0,0,.3)}
    html.dark .nav a{background:rgba(30,41,59,.7);border-color:rgba(51,65,85,.6);color:#cbd5e1}
    html.dark .stat,html.dark .metric,html.dark .meta-item,html.dark .sheet-card{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.08)}
    html.dark .result-item,html.dark .trace-item,html.dark .agent-item,html.dark .note-item{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.08)}
    html.dark input,html.dark textarea,html.dark select{background:rgba(2,6,23,.6);border-color:rgba(51,65,85,.6);color:#f1f5f9}
    html.dark .checkbox-pill{background:rgba(30,41,59,.4);border-color:rgba(51,65,85,.5)}
    html.dark .btn-tertiary{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1);color:var(--ink)}
    html.dark code,html.dark .mono{background:rgba(255,255,255,.06)}
    html.dark .code-block{background:rgba(3,10,21,.72);border-color:rgba(14,165,233,.12);color:#e2e8f0}
    html.dark th,html.dark td{border-color:rgba(255,255,255,.08)}
    html.dark .pill{background:rgba(245,158,11,.16);color:#fcd34d}
    html.dark .subtle-pill{color:#93c5fd;background:rgba(59,130,246,.14);border-color:rgba(59,130,246,.28)}
    html.dark .theme-toggle{background:rgba(30,41,59,.8);border-color:rgba(51,65,85,.6)}
    @media (max-width:980px){.hero,.grid,.database-layout,.split,.section-grid{grid-template-columns:1fr}.stats,.metric-grid,.meta-grid{grid-template-columns:repeat(2,1fr)}.page-header,.topbar{flex-direction:column;align-items:flex-start}}
    @media (max-width:640px){.stats,.metric-grid,.meta-grid{grid-template-columns:1fr}.wrap{width:min(1180px,calc(100vw - 24px))}}
    </style>
  `;
}

function renderLoginPage(errorMessage = ""): string {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>登入 - 双云 AI 行銷部</title><style>${renderSharedStyles()}</style></head><body><div class="wrap"><section class="hero" style="grid-template-columns:1fr;max-width:720px;margin:40px auto 0;"><div><div class="eyebrow">Access Control</div><h1>登入双云 Agent Platform</h1><p class="lead">請輸入您的存取 Token（secret 部分即可，不需要貼 alias:role: 前綴）。登入成功後系統會記住您的身份。</p></div></section><section class="panel" style="max-width:720px;margin:0 auto;"><form id="login-form" class="stack"><div class="field"><label for="token">存取 Token</label><input id="token" name="token" type="password" placeholder="貼上您的 secret token" autocomplete="off" required></div><div id="login-error" class="${errorMessage ? "result-panel is-visible error" : "result-panel"}"><p class="muted">${escapeHtml(errorMessage)}</p></div><div class="submit-row"><button class="btn btn-primary" type="submit">登入</button></div></form></section></div><script>const form=document.getElementById("login-form");const errorPanel=document.getElementById("login-error");function escapeHtml(value){return String(value).replace(/[&<>"']/g,function(char){const map={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};return map[char]||char;});}function setError(message){errorPanel.className="result-panel is-visible error";errorPanel.innerHTML='<p class="muted">'+escapeHtml(message)+"</p>";}form.addEventListener("submit",async function(event){event.preventDefault();const submitButton=form.querySelector('button[type="submit"]');submitButton.disabled=true;submitButton.textContent="登入中...";try{const token=document.getElementById("token").value;const response=await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})});const result=await response.json();if(!response.ok){setError(result?.error?.message||"登入失敗");return;}window.location.href="/";}catch(error){const message=error&&typeof error==="object"&&"message" in error?error.message:"登入失敗";setError(message);}finally{submitButton.disabled=false;submitButton.textContent="登入";}});</script></body></html>`;
}

function renderTopbar(active: "dashboard" | "onboarding" | "database" | "demo" | "demo-compare"): string {
  const demoIsActive = active === "demo" || active === "demo-compare";
  return `<button class="theme-toggle" onclick="(function(){var d=document.documentElement.classList.toggle('dark');localStorage.setItem('sy-theme',d?'dark':'light');this.textContent=d?'☀️':'🌙'}).call(this)" id="theme-btn">🌙</button><script>document.getElementById('theme-btn').textContent=document.documentElement.classList.contains('dark')?'☀️':'🌙'</script><div class="topbar"><div><div class="eyebrow" style="display:flex;align-items:center;gap:8px"><span style="display:inline-flex;width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#38bdf8,#dc2626,#f59e0b);align-items:center;justify-content:center;font-size:14px">🧠</span> 双云 AI 行銷部</div><div class="muted">腦 × 手 = 客戶 AI 行銷部</div></div><nav class="nav" aria-label="主導覽"><a href="/" class="${active === "dashboard" ? "active" : ""}">Dashboard</a><a href="/demo" class="${demoIsActive ? "active" : ""}">任務中心</a><a href="/database" class="${active === "database" ? "active" : ""}">品牌資料庫</a><a href="/onboarding" class="${active === "onboarding" ? "active" : ""}">新增客戶</a><a href="/members">團隊儀表板</a><a href="/leaderboard">排行榜</a></nav></div>`;
}

function renderDashboard(snapshot: ReturnType<RepositoryBundle["snapshot"]>, clients: Client[], tasks: Task[]): string {
  const clientCards = clients
    .map(
      (client) => `<article class="record-card"><header><div><h3>${escapeHtml(client.name)}</h3><p class="muted">Client ID: ${escapeHtml(client.clientId)}</p></div><span class="pill">${escapeHtml(client.industry)}</span></header><p class="muted">Tier: ${escapeHtml(client.subscription.tier)} / Agent Lv.${client.subscription.agentLevel}</p><p class="muted">Form: ${client.googleFormUrl ? `<a href="${escapeHtml(client.googleFormUrl)}" target="_blank" class="btn-link">開啟 Form ↗</a>` : "尚未串接"}</p><p><a class="btn-link" href="/database/${encodeURIComponent(client.clientId)}">打開 Profile Sheet</a></p></article>`
    )
    .join("");

  const taskRows = tasks
    .map(
      (task) => `<tr><td>${escapeHtml(task.title)}</td><td>${escapeHtml(task.clientId)}</td><td>${escapeHtml(task.skillId)}</td><td><span class="status status-${escapeHtml(task.status)}">${escapeHtml(task.status)}</span></td><td>${task.progress}%</td></tr>`
    )
    .join("");

  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>双云 AI Marketing Dept MVP</title><style>${renderSharedStyles()}</style></head><body><div class="wrap">${renderTopbar("dashboard")}<section class="hero"><div><div class="eyebrow">Two-Clouds MVP</div><h1>双云 AI 行銷部<br>Runtime Dashboard</h1><p class="lead">維持既有 inline HTML 服務首頁，同時把品牌資料庫補上 Profile Sheet、Detail Page 與 Markdown 匯入，讓 Phase 6 UI 可以直接在本機驗證。</p><div class="cta-row"><a class="btn btn-tertiary" href="/onboarding">+ 新增客戶</a><a class="btn btn-primary" href="/onboarding">開始接入流程</a><a class="btn btn-secondary" href="/database">進入品牌資料庫</a></div></div><div class="stats"><div class="stat"><span class="muted">Clients</span><strong>${snapshot.clients}</strong></div><div class="stat"><span class="muted">Brand Brains</span><strong>${snapshot.brandBrains}</strong></div><div class="stat"><span class="muted">Outputs</span><strong>${snapshot.outputs}</strong></div><div class="stat"><span class="muted">Traces</span><strong>${snapshot.traces}</strong></div></div></section><section class="grid"><section class="panel"><h2>客戶總覽</h2><p class="muted">保留既有 dashboard 概念，並把每個 client 接到新的品牌資料庫 detail route。</p><div class="client-list">${clientCards || '<p class="empty-state">No clients yet.</p>'}</div></section><section class="panel"><h2>API Surface</h2><div class="task-list"><div class="task-card"><strong>GET</strong> <code>/database</code><br><span class="muted">品牌資料庫總覽 + Markdown 匯入</span></div><div class="task-card"><strong>GET</strong> <code>/database/:clientId</code><br><span class="muted">Client detail page + Profile Sheet 側欄</span></div><div class="task-card"><strong>GET</strong> <code>/database/:clientId/outputs/:outputId</code><br><span class="muted">Output detail page + trace</span></div><div class="task-card"><strong>POST</strong> <code>/api/clients/:clientId/markdown-import</code><br><span class="muted">匯入 .md 並寫入 SQLite</span></div></div></section></section><section class="panel" style="margin-top:22px;"><h2>任務追蹤</h2><table><thead><tr><th>Task</th><th>Client</th><th>Skill</th><th>Status</th><th>Progress</th></tr></thead><tbody>${taskRows || '<tr><td colspan="5" class="muted">No tasks yet.</td></tr>'}</tbody></table></section></div></body></html>`;
}

function renderOnboardingPage(): string {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>新客戶接入 - 双云 AI 行銷部</title><style>${renderSharedStyles()}</style></head><body><div class="wrap">${renderTopbar("onboarding")}<header class="page-header"><div><div class="eyebrow">Onboarding Intake</div><h1>新增客戶 + 品牌腦</h1><p class="lead">填寫基本資料建立客戶檔案與 4 Agent 委員會。建立完成後會自動跳到品牌腦 Builder，上傳品牌文件讓 AI 自動生成精準的品牌腦。</p></div><a class="btn btn-tertiary" href="/">返回首頁</a></header><form id="onboarding-form" class="stack"><section class="panel"><h2>品牌基本</h2><p class="muted">先建立品牌主檔與主要聯絡人，這些資料會直接進入 onboarding payload。</p><div class="section-grid"><div class="field"><label for="brandName">品牌名稱</label><input id="brandName" name="brandName" type="text" placeholder="例：双云行銷" required></div><div class="field"><label for="industry">產業類別</label><input id="industry" name="industry" type="text" placeholder="例：AI 教育訓練 / 品牌顧問"></div><div class="field"><label for="ownerName">負責人姓名</label><input id="ownerName" name="ownerName" type="text" placeholder="例：Jacky"></div><div class="field"><label for="ownerEmail">負責人 Email</label><input id="ownerEmail" name="ownerEmail" type="email" placeholder="例：owner@example.com"></div></div></section><section class="panel"><h2>品牌語調</h2><p class="muted">這一段會成為 brand agent 的基礎 prompt 約束，避免內容風格偏移。</p><div class="section-grid"><div class="field"><label for="toneOfVoice">語調風格</label><input id="toneOfVoice" name="toneOfVoice" type="text" placeholder="例：專業但親切、帶顧問感"></div><div class="field field-full"><label for="bannedTopics">禁談主題</label><textarea id="bannedTopics" name="bannedTopics" placeholder="例：避免政治立場、避免誇大保證、避免比較競品"></textarea></div></div></section><section class="panel"><h2>行銷目標</h2><p class="muted">聚焦目標、受眾、核心 offer 與現況痛點，讓策略腦能快速生成初版 brand brain。</p><div class="section-grid"><div class="field field-full"><label for="primaryGoal">主要目標</label><textarea id="primaryGoal" name="primaryGoal" placeholder="例：30 天內完成第一波 AI 課程招生與潛在名單蒐集"></textarea></div><div class="field field-full"><label for="targetAudience">目標受眾</label><textarea id="targetAudience" name="targetAudience" placeholder="例：中小企業主、品牌經理、想導入 AI 的行銷團隊"></textarea></div><div class="field field-full"><label for="keyOffer">核心提案</label><textarea id="keyOffer" name="keyOffer" placeholder="例：提供 AI 行銷部門導入顧問、實作訓練與代營運服務"></textarea></div><div class="field"><label for="successMetric">成功指標</label><input id="successMetric" name="successMetric" type="text" placeholder="例：表單名單 50 筆、成交 5 家"></div><div class="field field-full"><label for="currentPainPoint">目前痛點</label><textarea id="currentPainPoint" name="currentPainPoint" placeholder="例：內容產出慢、提案轉換低、缺少固定成效追蹤機制"></textarea></div></div></section><section class="panel"><h2>執行計畫</h2><p class="muted">設定偏好的投放渠道與節奏，系統會把這些內容寫入 onboarding payload 並建立後續工作基礎。</p><div class="section-grid"><div class="field field-full"><label>偏好渠道</label><div class="checkbox-grid"><label class="checkbox-pill"><input name="preferredChannels" type="checkbox" value="FB">FB</label><label class="checkbox-pill"><input name="preferredChannels" type="checkbox" value="IG">IG</label><label class="checkbox-pill"><input name="preferredChannels" type="checkbox" value="EDM">EDM</label><label class="checkbox-pill"><input name="preferredChannels" type="checkbox" value="LINE">LINE</label><label class="checkbox-pill"><input name="preferredChannels" type="checkbox" value="部落格">部落格</label><label class="checkbox-pill"><input name="preferredChannels" type="checkbox" value="TikTok">TikTok</label><label class="checkbox-pill"><input name="preferredChannels" type="checkbox" value="YouTube">YouTube</label></div></div><div class="field"><label for="contentCadence">內容節奏</label><input id="contentCadence" name="contentCadence" type="text" placeholder="例：每週 3 篇貼文 + 1 封 EDM"></div><div class="field"><label for="campaignWindow">Campaign Window</label><input id="campaignWindow" name="campaignWindow" type="text" placeholder="例：2026-04-15 to 2026-05-15"></div></div></section><div class="submit-row"><button class="btn btn-primary" type="submit">建立客戶 → 接著設定品牌腦</button></div></form><section id="result" class="panel result-panel" aria-live="polite"></section></div><script>const form=document.getElementById("onboarding-form");const resultPanel=document.getElementById("result");function escapeHtml(value){return String(value).replace(/[&<>"']/g,function(char){const map={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};return map[char]||char;});}function setResult(kind,title,body){resultPanel.className="panel result-panel is-visible "+kind;resultPanel.innerHTML="<h2>"+escapeHtml(title)+"</h2>"+body;resultPanel.scrollIntoView({behavior:"smooth",block:"start"});}form.addEventListener("submit",async function(event){event.preventDefault();const formData=new FormData(form);const payload={brandName:String(formData.get("brandName")||""),industry:String(formData.get("industry")||""),primaryGoal:String(formData.get("primaryGoal")||""),targetAudience:String(formData.get("targetAudience")||""),keyOffer:String(formData.get("keyOffer")||""),toneOfVoice:String(formData.get("toneOfVoice")||""),bannedTopics:String(formData.get("bannedTopics")||""),preferredChannels:Array.from(document.querySelectorAll('input[name="preferredChannels"]:checked')).map(function(input){return input.value;}),contentCadence:String(formData.get("contentCadence")||""),campaignWindow:String(formData.get("campaignWindow")||""),currentPainPoint:String(formData.get("currentPainPoint")||""),successMetric:String(formData.get("successMetric")||""),ownerName:String(formData.get("ownerName")||""),ownerEmail:String(formData.get("ownerEmail")||"")};const submitButton=form.querySelector('button[type="submit"]');submitButton.disabled=true;submitButton.textContent="建立中...";try{const response=await fetch("/api/onboarding",{method:"POST",headers:{"content-type":"application/json","x-confirm-cost":"true"},body:JSON.stringify(payload)});const result=await response.json();if(response.ok){const googleForm=result.googleFormUrl?'<a href="'+escapeHtml(result.googleFormUrl)+'" target="_blank" style="color:var(--accent-a)">開啟 Form ↗</a>':"尚未串接";setResult("success","建立成功",'<div class="result-list">'+'<div class="result-item"><strong>Client ID</strong><span>'+escapeHtml(result.clientId||"")+"</span></div>"+'<div class="result-item"><strong>Brand Name</strong><span>'+escapeHtml(result.brandName||payload.brandName)+"</span></div>"+'<div class="result-item"><strong>Google Form URL</strong><span>'+googleForm+"</span></div>"+'<div class="result-item"><strong>Brain ID</strong><span>'+escapeHtml(result.brainId||"")+"</span></div>"+'<div class="result-item" style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08)"><p class=\\"muted\\">客戶已建立！3 秒後自動跳到品牌腦 Builder 上傳品牌文件...</p><a class=\\"btn btn-primary\\" href=\\"/brand-brain-builder/'+escapeHtml(result.clientId||"")+'\\">📂 立即前往品牌腦 Builder</a></div>'+"</div>");form.reset();setTimeout(function(){window.location.href="/brand-brain-builder/"+encodeURIComponent(result.clientId||"")},3000);return;}setResult("error","建立失敗",'<p class="muted">'+escapeHtml(result.error?.message||result.error?.code||JSON.stringify(result.error)||"Unknown error")+"</p>");}catch(error){const message=error&&typeof error==="object"&&"message" in error?error.message:"Request failed";setResult("error","建立失敗",'<p class="muted">'+escapeHtml(message)+"</p>");}finally{submitButton.disabled=false;submitButton.textContent="建立客戶 → 接著設定品牌腦";}});</script></body></html>`;
}

function renderProfileSheet(client: Client, brandBrain: BrandBrain | null, stats: ClientOutputStats): string {
  const agents = brandBrain ? Object.values(brandBrain.agents).map((agent) => `<li class="agent-item"><strong>${escapeHtml(agent.role)}</strong><div class="muted">${escapeHtml(previewText(agent.systemPrompt, 92))}</div></li>`).join("") : '<li class="agent-item muted">尚未建立 Brand Brain</li>';
  const notes = brandBrain?.strategyNotes.length ? brandBrain.strategyNotes.map((note) => `<li class="note-item">${escapeHtml(note)}</li>`).join("") : '<li class="note-item muted">尚無 strategy notes</li>';
  return `<aside class="sheet"><div class="eyebrow">Profile Sheet</div><h2>${escapeHtml(client.name)}</h2><p class="muted">${escapeHtml(client.industry)} · 建立於 ${escapeHtml(formatDateTime(client.createdAt))}</p><div class="meta-grid"><div class="meta-item"><span class="muted">Client ID</span><br><strong>${escapeHtml(client.clientId)}</strong></div><div class="meta-item"><span class="muted">狀態</span><br><strong>${escapeHtml(client.status)}</strong></div><div class="meta-item"><span class="muted">Google Form</span><br><strong>${client.googleFormUrl ? `<a href="${escapeHtml(client.googleFormUrl)}" target="_blank" style="color:var(--accent-a)">開啟 ↗</a>` : "尚未串接"}</strong></div><div class="meta-item"><span class="muted">Brain 版本</span><br><strong>${brandBrain ? brandBrain.version : "未建立"}</strong></div></div><div class="sheet-card"><header><div><strong>資料庫摘要</strong><p class="muted">品牌資料庫總覽</p></div><span class="subtle-pill">${stats.total} 筆</span></header><ul class="agent-list"><li class="agent-item"><strong>本週新增</strong><div class="muted">${stats.thisWeek}</div></li><li class="agent-item"><strong>待審</strong><div class="muted">${stats.pendingReview}</div></li><li class="agent-item"><strong>已上架</strong><div class="muted">${stats.published}</div></li></ul></div><div class="sheet-card"><header><div><strong>4 Agent 委員會</strong><p class="muted">由 onboarding 建立</p></div></header><ul class="agent-list">${agents}</ul></div><div class="sheet-card"><header><div><strong>Strategy Notes</strong><p class="muted">品牌腦摘要</p></div></header><ul class="note-list">${notes}</ul></div></aside>`;
}

function renderDatabaseOverview(repositories: RepositoryBundle): string {
  const clients = repositories.clients.list();
  const clientCards = clients.map((client) => {
    const outputs = repositories.outputs.listByClient(client.clientId);
    const stats = summarizeOutputs(outputs);
    const latest = outputs[0];
    return `<article class="record-card"><header><div><h3>${escapeHtml(client.name)}</h3><p class="muted">${escapeHtml(client.industry)}</p></div><span class="pill">${stats.total} 筆</span></header><div class="meta-grid"><div class="meta-item"><span class="muted">本週新增</span><br><strong>${stats.thisWeek}</strong></div><div class="meta-item"><span class="muted">待審</span><br><strong>${stats.pendingReview}</strong></div><div class="meta-item"><span class="muted">已上架</span><br><strong>${stats.published}</strong></div><div class="meta-item"><span class="muted">Form</span><br><strong>${client.googleFormUrl ? "已串接" : "stub"}</strong></div></div><p class="muted">最近一筆：${latest ? `${escapeHtml(latest.title)} · ${escapeHtml(formatDateTime(latest.createdAt))}` : "尚無輸出"}</p><div class="cta-row"><a class="btn btn-tertiary" href="/database/${encodeURIComponent(client.clientId)}">打開 Profile Sheet</a>${latest ? `<a class="btn btn-secondary" href="/database/${encodeURIComponent(client.clientId)}/outputs/${encodeURIComponent(latest.outputId)}">最近一筆 Detail</a>` : ""}</div></article>`;
  }).join("");
  const clientOptions = clients.map((client) => `<option value="${escapeHtml(client.clientId)}">${escapeHtml(client.name)} (${escapeHtml(client.clientId)})</option>`).join("");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>品牌資料庫 - 双云 AI 行銷部</title><style>${renderSharedStyles()}</style></head><body><div class="wrap">${renderTopbar("database")}<header class="page-header"><div><div class="eyebrow">Brand Database</div><h1>品牌資料庫總覽</h1><p class="lead">把每個 client 的 Profile Sheet、資料庫統計與 Markdown 匯入入口集中在同一頁。匯入成功後直接產生 SQLite task/output/traces，可立刻進 detail page。</p></div><a class="btn btn-tertiary" href="/">返回首頁</a></header><section class="panel"><h2>Markdown 匯入</h2><p class="muted">選擇目標 client 與一份 <code>.md</code>，系統會讀檔內容、建立完成任務與 draft output，並寫進 SQLite。</p><form id="markdown-import-form" class="section-grid"><div class="field"><label for="import-client">目標 Client</label><select id="import-client" name="clientId" required ${clients.length ? "" : "disabled"}><option value="">請選擇 client</option>${clientOptions}</select></div><div class="field"><label for="import-file">Markdown 檔案</label><input id="import-file" name="file" type="file" accept=".md,text/markdown" ${clients.length ? "" : "disabled"}></div><div class="field field-full"><label for="import-preview">預覽</label><textarea id="import-preview" name="preview" placeholder="選擇 .md 後會顯示前 2000 字預覽" readonly></textarea></div><div class="submit-row field-full"><button class="btn btn-primary" type="submit" ${clients.length ? "" : "disabled"}>匯入 Markdown 到 SQLite</button></div></form><section id="import-result" class="panel result-panel" aria-live="polite"></section></section><section class="panel" style="margin-top:22px;"><h2>Client 卡片</h2><div class="overview-grid">${clientCards || '<div class="empty-state">目前沒有 client。先到 onboarding 建一個，再回來匯入 Markdown。</div>'}</div></section></div><script>const form=document.getElementById("markdown-import-form");const fileInput=document.getElementById("import-file");const preview=document.getElementById("import-preview");const resultPanel=document.getElementById("import-result");let currentMarkdown="";function escapeHtml(value){return String(value).replace(/[&<>"']/g,function(char){const map={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};return map[char]||char;});}function setResult(kind,title,body){resultPanel.className="panel result-panel is-visible "+kind;resultPanel.innerHTML="<h2>"+escapeHtml(title)+"</h2>"+body;}fileInput&&fileInput.addEventListener("change",async function(){const file=fileInput.files&&fileInput.files[0];if(!file){currentMarkdown="";preview.value="";return;}currentMarkdown=await file.text();preview.value=currentMarkdown.slice(0,2000);});form&&form.addEventListener("submit",async function(event){event.preventDefault();const clientId=document.getElementById("import-client").value;const file=fileInput.files&&fileInput.files[0];if(!clientId){setResult("error","匯入失敗",'<p class="muted">請先選擇 client。</p>');return;}if(!file||!currentMarkdown.trim()){setResult("error","匯入失敗",'<p class="muted">請先選擇一份 .md 檔案。</p>');return;}const submitButton=form.querySelector('button[type="submit"]');submitButton.disabled=true;submitButton.textContent="匯入中...";try{const response=await fetch("/api/clients/"+encodeURIComponent(clientId)+"/markdown-import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({filename:file.name,markdown:currentMarkdown})});const result=await response.json();if(!response.ok){setResult("error","匯入失敗",'<p class="muted">'+escapeHtml(result.error||"Unknown error")+"</p>");return;}setResult("success","匯入完成",'<div class="result-list">'+'<div class="result-item"><strong>Task ID</strong><span>'+escapeHtml(result.taskId)+"</span></div>"+'<div class="result-item"><strong>Output ID</strong><span>'+escapeHtml(result.outputId)+"</span></div>"+'<div class="result-item"><strong>Title</strong><span>'+escapeHtml(result.title)+"</span></div>"+'<div class="result-item"><strong>Detail Page</strong><span><a href="/database/'+escapeHtml(clientId)+"/outputs/"+escapeHtml(result.outputId)+'">打開詳情頁</a></span></div>'+"</div>");form.reset();preview.value="";currentMarkdown="";}catch(error){const message=error&&typeof error==="object"&&"message" in error?error.message:"Request failed";setResult("error","匯入失敗",'<p class="muted">'+escapeHtml(message)+"</p>");}finally{const submitButton=form.querySelector('button[type="submit"]');submitButton.disabled=false;submitButton.textContent="匯入 Markdown 到 SQLite";}});</script></body></html>`;
}

function renderClientDetailPage(client: Client, brandBrain: BrandBrain | null, outputs: Output[], tasks: Task[]): string {
  const stats = summarizeOutputs(outputs);
  const outputCards = outputs.map((output) => `<article class="record-card"><header><div><h3>${escapeHtml(output.title)}</h3><p class="muted">${escapeHtml(formatDateTime(output.createdAt))} · ${escapeHtml(output.skillUsed)}</p></div><span class="status status-${escapeHtml(output.status)}">${escapeHtml(output.status)}</span></header><p>${escapeHtml(previewText(output.contentBody, 140))}</p><div class="cta-row"><a class="btn btn-tertiary" href="/database/${encodeURIComponent(client.clientId)}/outputs/${encodeURIComponent(output.outputId)}">打開 Detail page</a></div></article>`).join("");
  const taskCards = tasks.slice(0, 6).map((task) => `<article class="task-card"><header><div><strong>${escapeHtml(task.title)}</strong><p class="muted">${escapeHtml(formatDateTime(task.createdAt))}</p></div><span class="status status-${escapeHtml(task.status)}">${escapeHtml(task.status)}</span></header><p class="muted">skill: ${escapeHtml(task.skillId)} · progress: ${task.progress}%</p></article>`).join("");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(client.name)} - Profile Sheet</title><style>${renderSharedStyles()}</style></head><body><div class="wrap">${renderTopbar("database")}<div class="breadcrumbs"><a href="/database">品牌資料庫</a><span>/</span><span>${escapeHtml(client.name)}</span></div><header class="page-header"><div><div class="eyebrow">Client Detail</div><h1>${escapeHtml(client.name)} · Profile Sheet</h1><p class="lead">這頁把 client 的品牌資料庫、最近輸出與 Brand Brain 摘要集中在一起，右側固定顯示 Profile Sheet 側欄。</p></div><a class="btn btn-tertiary" href="/database">返回資料庫總覽</a></header><section class="metric-grid"><div class="metric"><span class="muted">總筆數</span><strong>${stats.total}</strong></div><div class="metric"><span class="muted">本週新增</span><strong>${stats.thisWeek}</strong></div><div class="metric"><span class="muted">待審</span><strong>${stats.pendingReview}</strong></div><div class="metric"><span class="muted">已上架</span><strong>${stats.published}</strong></div></section><section class="database-layout"><div class="stack"><section class="panel"><h2>輸出清單</h2><p class="muted">包含系統產出與 Markdown 匯入的內容。每一筆都能進 detail page 檢查內容與 traces。</p><div class="record-list">${outputCards || '<div class="empty-state">尚無輸出，可先回到總覽頁匯入一份 Markdown。</div>'}</div></section><section class="panel"><h2>最近任務</h2><div class="task-list">${taskCards || '<div class="empty-state">尚無任務紀錄。</div>'}</div></section></div>${renderProfileSheet(client, brandBrain, stats)}</section></div></body></html>`;
}

function renderOutputDetailPage(client: Client, brandBrain: BrandBrain | null, output: Output, task: Task | null, traces: TraceLog[]): string {
  const stats = summarizeOutputs([output]);
  const traceCards = traces.map((trace) => `<li class="trace-item"><strong>${escapeHtml(trace.stepName)}</strong><div class="muted">${escapeHtml(trace.phase)} · ${escapeHtml(formatDateTime(trace.startedAt))}</div><div>input: ${escapeHtml(trace.inputSummary)}</div><div>output: ${escapeHtml(trace.outputSummary)}</div>${trace.errorCode ? `<div class="muted">error: ${escapeHtml(trace.errorCode)}</div>` : ""}</li>`).join("");
  const reviewBlock = output.review ? `<div class="meta-grid"><div class="meta-item"><span class="muted">Verdict</span><br><strong>${escapeHtml(output.review.verdict)}</strong></div><div class="meta-item"><span class="muted">Confidence</span><br><strong>${output.review.confidence}</strong></div><div class="meta-item"><span class="muted">Boss</span><br><strong>${output.review.bossScore}</strong></div><div class="meta-item"><span class="muted">Manager</span><br><strong>${output.review.managerScore}</strong></div><div class="meta-item"><span class="muted">Window</span><br><strong>${output.review.windowScore}</strong></div><div class="meta-item"><span class="muted">Brand</span><br><strong>${output.review.brandScore}</strong></div></div><div class="sheet-card"><strong>Reasoning Trace</strong><p class="muted">${escapeHtml(output.review.reasoningTrace)}</p></div>` : '<div class="empty-state">這筆內容尚未經過 committee review，屬於匯入或草稿狀態。</div>';
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(output.title)} - Detail Page</title><style>${renderSharedStyles()}</style></head><body><div class="wrap">${renderTopbar("database")}<div class="breadcrumbs"><a href="/database">品牌資料庫</a><span>/</span><a href="/database/${encodeURIComponent(client.clientId)}">${escapeHtml(client.name)}</a><span>/</span><span>${escapeHtml(output.title)}</span></div><header class="page-header"><div><div class="eyebrow">Detail Page</div><h1>${escapeHtml(output.title)}</h1><p class="lead">查看單筆內容的 metadata、task 狀態、trace 與原始 Markdown 內容。</p></div><a class="btn btn-tertiary" href="/database/${encodeURIComponent(client.clientId)}">返回 Profile Sheet</a></header><section class="database-layout"><div class="stack"><section class="panel"><h2>內容摘要</h2><div class="meta-grid"><div class="meta-item"><span class="muted">Output ID</span><br><strong>${escapeHtml(output.outputId)}</strong></div><div class="meta-item"><span class="muted">Task ID</span><br><strong>${escapeHtml(task?.taskId ?? output.taskId)}</strong></div><div class="meta-item"><span class="muted">狀態</span><br><strong>${escapeHtml(output.status)}</strong></div><div class="meta-item"><span class="muted">Skill</span><br><strong>${escapeHtml(output.skillUsed)}</strong></div><div class="meta-item"><span class="muted">建立時間</span><br><strong>${escapeHtml(formatDateTime(output.createdAt))}</strong></div><div class="meta-item"><span class="muted">Task 完成</span><br><strong>${escapeHtml(formatDateTime(task?.completedAt ?? null))}</strong></div></div></section><section class="panel"><h2>Markdown 原文</h2>${renderMarkdownSource(output.contentBody)}</section><section class="panel"><h2>Committee Review</h2>${reviewBlock}</section><section class="panel"><h2>Trace Timeline</h2><ul class="trace-list">${traceCards || '<li class="trace-item muted">沒有 trace。</li>'}</ul></section></div>${renderProfileSheet(client, brandBrain, stats)}</section></div></body></html>`;
}

function buildClientApiPayload(repositories: RepositoryBundle, client: Client) {
  const brandBrain = repositories.brandBrains.getByClientId(client.clientId);
  const outputs = repositories.outputs.listByClient(client.clientId);
  const tasks = repositories.tasks.listByClient(client.clientId);
  return { ok: true, client, brandBrain, stats: summarizeOutputs(outputs), outputs, tasks };
}

function buildBrandBrainBuilderPayload(repositories: RepositoryBundle, client: Client) {
  return {
    ok: true,
    client,
    brandBrain: repositories.brandBrains.getByClientId(client.clientId),
    dataroom: repositories.brandDataroom.listByClientId(client.clientId)
  };
}

function canAccessMember(actor: Actor, memberAlias: string): boolean {
  return actor.role === "admin" || actor.alias === memberAlias;
}

function findMemberByAliasOrNull(repositories: RepositoryBundle, alias: string): TeamMember | null {
  return repositories.teamMembers.getByAlias(alias);
}

function parseLimit(rawValue: string | null): number {
  if (!rawValue) {
    return 100;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("limit 必須是正整數");
  }
  return Math.min(parsed, 100);
}

function resolveMemberIdForActor(repositories: RepositoryBundle, actorAlias: string): string | null {
  const member = repositories.teamMembers.getByAlias(actorAlias);
  return member?.memberId ?? memberIdFromAlias(actorAlias);
}

function isSupportedBrandBrainFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".docx");
}

function truncateBrandDataroomContent(content: string): { content: string; contentLength: number; truncated: boolean } {
  const contentLength = Buffer.byteLength(content, "utf8");
  if (contentLength <= MAX_BRAND_DATAROOM_BYTES) {
    return { content, contentLength, truncated: false };
  }

  let totalBytes = 0;
  let truncatedContent = "";
  for (const character of content) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (totalBytes + characterBytes > MAX_BRAND_DATAROOM_BYTES) {
      break;
    }
    truncatedContent += character;
    totalBytes += characterBytes;
  }

  return {
    content: truncatedContent,
    contentLength,
    truncated: true
  };
}

function buildBrandBrainToSave(
  client: Client,
  current: BrandBrain | null,
  payload: z.infer<typeof brandBrainConfirmSchema>
): BrandBrain {
  const brainId = current?.brainId ?? `brain_${client.clientId}`;
  const version = current ? current.version + 1 : 1;
  const lastUpdated = new Date().toISOString();

  return {
    brainId,
    clientId: client.clientId,
    strategyNotes: payload.strategyNotes,
    agents: {
      boss: {
        agentId: current?.agents.boss.agentId ?? `${brainId}_boss`,
        role: "boss",
        systemPrompt: payload.agents.boss.systemPrompt,
        dataroomRefs: payload.agents.boss.dataroomRefs,
        responsibilities: payload.agents.boss.responsibilities
      },
      manager: {
        agentId: current?.agents.manager.agentId ?? `${brainId}_manager`,
        role: "manager",
        systemPrompt: payload.agents.manager.systemPrompt,
        dataroomRefs: payload.agents.manager.dataroomRefs,
        responsibilities: payload.agents.manager.responsibilities
      },
      window: {
        agentId: current?.agents.window.agentId ?? `${brainId}_window`,
        role: "window",
        systemPrompt: payload.agents.window.systemPrompt,
        dataroomRefs: payload.agents.window.dataroomRefs,
        responsibilities: payload.agents.window.responsibilities
      },
      brand: {
        agentId: current?.agents.brand.agentId ?? `${brainId}_brand`,
        role: "brand",
        systemPrompt: payload.agents.brand.systemPrompt,
        dataroomRefs: payload.agents.brand.dataroomRefs,
        responsibilities: payload.agents.brand.responsibilities
      }
    },
    dataroomPath: client.dataroomPath,
    version,
    lastUpdated
  };
}

function parseOptionalMoney(rawValue: unknown, fieldName: string): number | null | undefined {
  if (rawValue === undefined) {
    return undefined;
  }
  if (rawValue === null) {
    return null;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} 必須是大於等於 0 的數字或 null`);
  }
  return Number(parsed.toFixed(6));
}

function parseOptionalPositiveInt(rawValue: unknown, fieldName: string): number | null | undefined {
  if (rawValue === undefined) {
    return undefined;
  }
  if (rawValue === null) {
    return null;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} 必須是正整數或 null`);
  }
  return parsed;
}

function buildMemberOverview(repositories: RepositoryBundle, member: TeamMember) {
  const snapshot = getMemberSnapshot(repositories, member.memberId);
  return {
    memberId: member.memberId,
    alias: member.alias,
    displayName: member.displayName,
    role: member.role,
    status: member.status,
    today: snapshot.today,
    thisWeek: snapshot.thisWeek,
    thisMonth: snapshot.thisMonth,
    lastActiveAt: snapshot.lastActiveAt,
    statusHint: snapshot.statusHint
  };
}

function writeMemberTrace(
  repositories: RepositoryBundle,
  actor: Actor,
  stepName: string,
  inputSummary: string,
  outputSummary: string
): void {
  repositories.traces.save({
    traceId: randomUUID(),
    taskId: null,
    clientId: null,
    phase: "auth_audit",
    stepName,
    inputSummary: previewText(inputSummary, 240),
    outputSummary: previewText(outputSummary, 240),
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    errorCode: null
  });
}

function shiftIsoDays(value: string, days: number): string {
  return new Date(new Date(value).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function buildLeaderboardEntries(
  repositories: RepositoryBundle,
  period: "this_month" | "this_week" | "lifetime",
  limit: number
) {
  const now = new Date();
  const monthPrefix = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit"
  })
    .format(now)
    .replace("/", "-");
  const thisWeekSince = getTaipeiWeekSinceIso(now);
  const lastWeekSince = shiftIsoDays(thisWeekSince, -7);

  return repositories.teamMembers
    .listAll()
    .map((member) => {
      const wallet = repositories.wallets.getByMemberId(member.memberId) ?? ensureWalletForMember(repositories, member.memberId);
      const tierRule = repositories.tierRules.getByTier(wallet.tier);
      const periodEarn =
        period === "lifetime"
          ? wallet.lifetimeEarned
          : period === "this_week"
            ? repositories.walletTransactions.getWeeklyEarn(member.memberId, thisWeekSince)
            : repositories.walletTransactions.getMonthlyEarn(member.memberId, monthPrefix);
      const weekOverWeekGrowth = (() => {
        const currentWeek = repositories.walletTransactions.getWeeklyEarn(member.memberId, thisWeekSince);
        const lastWeek = repositories.walletTransactions
          .listByMemberId(member.memberId, { since: lastWeekSince, limit: 500 })
          .filter((transaction) => transaction.amount > 0 && transaction.createdAt < thisWeekSince)
          .reduce((sum, transaction) => sum + transaction.amount, 0);
        return lastWeek > 0 ? Number((currentWeek / lastWeek).toFixed(2)) : null;
      })();
      const taskCountThisPeriod =
        period === "lifetime"
          ? repositories.memberActivity.listByMemberId(member.memberId, { limit: 10_000 }).length
          : repositories.memberActivity.listByMemberId(member.memberId, {
              since: period === "this_week" ? thisWeekSince : `${monthPrefix}-01T00:00:00.000Z`,
              limit: 10_000
            }).length;
      return {
        memberId: member.memberId,
        alias: member.alias,
        displayName: member.displayName,
        tier: wallet.tier,
        tierIcon: tierRule?.icon ?? "",
        earnThisPeriod: periodEarn,
        lifetimeEarned: wallet.lifetimeEarned,
        weekOverWeekGrowth,
        taskCountThisPeriod
      };
    })
    .filter((entry) => entry.earnThisPeriod > 0)
    .sort((left, right) => right.earnThisPeriod - left.earnThisPeriod)
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      ...entry
    }));
}

function parseSessionCookieToken(request: IncomingMessage): string | null {
  const cookieHeader = Array.isArray(request.headers.cookie) ? request.headers.cookie.join(";") : request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "sy_token") {
      return decodeURIComponent(rest.join("=").trim());
    }
  }

  return null;
}

function buildSessionCookie(token: string): string {
  return `sy_token=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/`;
}

function buildLogoutCookie(): string {
  return "sy_token=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/";
}

function redirectToLogin(response: ServerResponse): void {
  response.writeHead(302, { location: "/login" });
  response.end();
}

function sendHtml(response: ServerResponse, body: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

function sendKnownError(response: ServerResponse, error: unknown, fallbackMessage: string): void {
  if (error instanceof DailyBudgetExceededError) {
    sendErrorResponse(response, 429, "DAILY_BUDGET_EXCEEDED", "今日成本預算已用盡，請明天再試或提高預算。", {
      todayUsd: error.todayUsd,
      budgetUsd: error.budgetUsd
    });
    return;
  }

  if (error instanceof MemberQuotaExceededError) {
    sendErrorResponse(response, 429, "MEMBER_QUOTA_EXCEEDED", "個人今日配額已用盡，明天再試", {
      memberId: error.memberId,
      usedUsd: error.usedUsd,
      quotaUsd: error.quotaUsd,
      remainingUsd: error.remainingUsd,
      resetAt: error.resetAt
    });
    return;
  }

  if (error instanceof NoDocumentsUploadedError) {
    sendErrorResponse(response, 400, "NO_DOCUMENTS_UPLOADED", error.message);
    return;
  }

  if (error instanceof RequiredDocumentMissingError) {
    sendErrorResponse(response, 400, "REQUIRED_DOC_MISSING", error.message, {
      missingDocTypes: error.missingDocTypes
    });
    return;
  }

  if (error instanceof MemberArchivedError) {
    sendErrorResponse(response, 403, "MEMBER_ARCHIVED", "此帳號已停用", {
      alias: error.alias,
      memberId: error.memberId
    });
    return;
  }

  if (error instanceof InsufficientTokenBalanceError) {
    sendErrorResponse(response, 429, "INSUFFICIENT_TOKEN_BALANCE", "錢包餘額不足，請聯絡 Jacky 補 token", {
      memberId: error.memberId,
      balance: error.balance,
      required: error.required,
      deficit: error.deficit
    });
    return;
  }

  if (error instanceof TierDailyCapExceededError) {
    sendErrorResponse(response, 429, "TIER_DAILY_CAP_EXCEEDED", "已超過今日 tier 扣款上限", {
      memberId: error.memberId,
      tier: error.tier,
      dailyCap: error.dailyCap,
      todaySpent: error.todaySpent,
      required: error.required
    });
    return;
  }

  sendErrorResponse(response, 400, "INVALID_REQUEST", error instanceof Error ? error.message : fallbackMessage);
}

function buildKnownErrorPayload(error: unknown, fallbackMessage: string): { code: string; message: string; details?: Record<string, unknown> } {
  if (error instanceof DailyBudgetExceededError) {
    return {
      code: "DAILY_BUDGET_EXCEEDED",
      message: "今日成本額度已滿，請稍後再試。",
      details: {
        todayUsd: error.todayUsd,
        budgetUsd: error.budgetUsd
      }
    };
  }

  if (error instanceof MemberQuotaExceededError) {
    return {
      code: "MEMBER_QUOTA_EXCEEDED",
      message: "個人今日配額已用盡，明天再試",
      details: {
        memberId: error.memberId,
        usedUsd: error.usedUsd,
        quotaUsd: error.quotaUsd,
        remainingUsd: error.remainingUsd,
        resetAt: error.resetAt
      }
    };
  }

  if (error instanceof MemberArchivedError) {
    return {
      code: "MEMBER_ARCHIVED",
      message: "此帳號已停用",
      details: {
        alias: error.alias,
        memberId: error.memberId
      }
    };
  }

  if (error instanceof InsufficientTokenBalanceError) {
    return {
      code: "INSUFFICIENT_TOKEN_BALANCE",
      message: "錢包餘額不足，請聯絡 Jacky 補 token",
      details: {
        memberId: error.memberId,
        balance: error.balance,
        required: error.required,
        deficit: error.deficit
      }
    };
  }

  if (error instanceof TierDailyCapExceededError) {
    return {
      code: "TIER_DAILY_CAP_EXCEEDED",
      message: "已超過今日 tier 扣款上限",
      details: {
        memberId: error.memberId,
        tier: error.tier,
        dailyCap: error.dailyCap,
        todaySpent: error.todaySpent,
        required: error.required
      }
    };
  }

  if (error instanceof Error && error.message.includes("Client") && error.message.includes("not found")) {
    return {
      code: "CLIENT_NOT_FOUND",
      message: error.message
    };
  }

  return {
    code: "INVALID_REQUEST",
    message: error instanceof Error ? error.message : fallbackMessage
  };
}

function isProtectedPage(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/dashboard" ||
    pathname === "/tasks" ||
    pathname === "/database" ||
    pathname === "/onboarding" ||
    pathname === "/demo" ||
    pathname === "/demo/compare" ||
    pathname === "/members" ||
    pathname === "/leaderboard" ||
    pathname === "/marketplace" ||
    pathname === "/workflows" ||
    pathname.startsWith("/workflows/") ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/database/") ||
    pathname.startsWith("/members/") ||
    pathname.startsWith("/brand-brain-builder/")
  );
}

function hasValidSessionCookie(request: IncomingMessage, tokenRegistry: ReturnType<typeof parsePlatformAccessTokens>): boolean {
  return Boolean(parseSessionCookieToken(request) && authenticateRequest({ ...request, headers: { ...request.headers, authorization: undefined } } as IncomingMessage, tokenRegistry));
}

export function startStatusServer(host: string, port: number, repositories: RepositoryBundle, formsAdapter: GoogleFormsAdapter): Promise<Server> {
  // 初始化 Connectors
  import("./connectors/index.js").then(m => m.initConnectors()).catch(e => console.error("[connectors] init failed:", e));

  const tokenRegistry = parsePlatformAccessTokens(process.env.PLATFORM_ACCESS_TOKENS);
  const bootstrap = ensureTeamMembersFromTokens(tokenRegistry, repositories.teamMembers);
  console.log(`ensured ${bootstrap.ensured} team members`);
  const walletBootstrap = ensureWalletForAllMembers(repositories);
  console.log(
    `ensured ${walletBootstrap.ensured} wallets (` +
      `Bronze ${walletBootstrap.tierCounts.Bronze}, ` +
      `Silver ${walletBootstrap.tierCounts.Silver}, ` +
      `Gold ${walletBootstrap.tierCounts.Gold}, ` +
      `Platinum ${walletBootstrap.tierCounts.Platinum})`
  );
  const startedAt = Date.now();
  const appEnv = process.env.APP_ENV?.trim() || "development";
  const commitSha = process.env.COMMIT_SHA?.trim() || process.env.GIT_COMMIT_SHA?.trim() || "unknown";
  const requireViewer = requireAuth(tokenRegistry, "viewer");
  const requireOperator = requireAuth(tokenRegistry, "operator");
  const requireAdmin = requireAuth(tokenRegistry, "admin");

  const server = createServer(async (request, response) => {
    attachRequestContext(request);
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

    // Ch7 Audit：所有寫入類請求（POST/PUT/DELETE）在回應結束後寫一筆 auth_audit trace。
    // 例外：/health 與 /api/login 不記錄 audit（前者是 healthcheck，後者本身是身分驗證入口）。
    const method = (request.method ?? "GET").toUpperCase();
    const isMutation = method === "POST" || method === "PUT" || method === "DELETE";
    const skipAuditPaths = new Set(["/health", "/api/login"]);
    if (isMutation && !skipAuditPaths.has(url.pathname)) {
      response.on("finish", () => {
        const status = response.statusCode;
        const errorCode = status >= 400 ? `HTTP_${status}` : null;
        writeAuthAuditTrace(repositories.traces, {
          actor: (request as IncomingMessage & { context?: { actor: Actor | null } }).context?.actor ?? null,
          method,
          path: url.pathname,
          ip: getRequestIp(request),
          requestId: (request as IncomingMessage & { context?: { requestId: string } }).context?.requestId ?? "unknown",
          errorCode
        });
      });
    }

    const markdownImportMatch = url.pathname.match(/^\/api\/clients\/([^/]+)\/markdown-import$/);
    const clientApiMatch = url.pathname.match(/^\/api\/clients\/([^/]+)$/);
    const brandBrainBuilderUploadMatch = url.pathname.match(/^\/api\/brand-brain-builder\/([^/]+)\/upload$/);
    const brandBrainBuilderGenerateMatch = url.pathname.match(/^\/api\/brand-brain-builder\/([^/]+)\/generate$/);
    const brandBrainBuilderConfirmMatch = url.pathname.match(/^\/api\/brand-brain-builder\/([^/]+)\/confirm$/);
    const brandBrainBuilderGetMatch = url.pathname.match(/^\/api\/brand-brain-builder\/([^/]+)$/);
    const brandBrainBuilderPageMatch = url.pathname.match(/^\/brand-brain-builder\/([^/]+)$/);
    const outputDetailMatch = url.pathname.match(/^\/database\/([^/]+)\/outputs\/([^/]+)$/);
    const clientDetailMatch = url.pathname.match(/^\/database\/([^/]+)$/);
    const taskApiMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    const memberDetailMatch = url.pathname.match(/^\/api\/members\/([^/]+)$/);
    const memberQuotaMatch = url.pathname.match(/^\/api\/members\/([^/]+)\/quota$/);
    const memberStatusMatch = url.pathname.match(/^\/api\/members\/([^/]+)\/status$/);
    const memberNoteMatch = url.pathname.match(/^\/api\/members\/([^/]+)\/note$/);
    const walletGrantMatch = url.pathname.match(/^\/api\/members\/([^/]+)\/wallet\/grant$/);
    const walletPenaltyMatch = url.pathname.match(/^\/api\/members\/([^/]+)\/wallet\/penalty$/);
    const walletHistoryMatch = url.pathname.match(/^\/api\/members\/([^/]+)\/wallet-history$/);

    if (url.pathname === "/health") {
      sendJson(response, 200, {
        status: "ok",
        appEnv,
        commitSha,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000)
      });
      return;
    }

    if (url.pathname === "/login" && request.method === "GET") {
      if (hasValidSessionCookie(request, tokenRegistry)) {
        response.writeHead(302, { location: "/" });
        response.end();
        return;
      }
      sendHtml(response, renderLoginPage());
      return;
    }

    if (url.pathname === "/api/login" && request.method === "POST") {
      try {
        const payload = (await readJsonBody(request)) as { token?: unknown };
        const token = typeof payload.token === "string" ? payload.token.trim() : "";
        const actor = authenticateRequest(
          {
            ...request,
            headers: {
              ...request.headers,
              authorization: `Bearer ${token}`
            }
          } as IncomingMessage,
          tokenRegistry
        );
        if (!actor) {
          sendErrorResponse(response, 401, "INVALID_TOKEN", "Token 無效、缺失或已過期。");
          return;
        }

        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": buildSessionCookie(token)
        });
        response.end(JSON.stringify({ alias: actor.alias, role: actor.role }, null, 2));
      } catch (error) {
        sendErrorResponse(response, 400, "INVALID_REQUEST", error instanceof Error ? error.message : "登入請求格式錯誤。");
      }
      return;
    }

    if (url.pathname === "/api/logout" && request.method === "POST") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": buildLogoutCookie()
      });
      response.end(JSON.stringify({ ok: true }, null, 2));
      return;
    }

    if (url.pathname === "/api/me") {
      if (!requireViewer(request, response)) {
        return;
      }
      sendJson(response, 200, {
        alias: request.context.actor.alias,
        role: request.context.actor.role
      });
      return;
    }

    if (isProtectedPage(url.pathname) && !hasValidSessionCookie(request, tokenRegistry)) {
      redirectToLogin(response);
      return;
    }

    if (url.pathname === "/api/status") {
      if (!requireViewer(request, response)) {
        return;
      }
      sendJson(response, 200, { ok: true, snapshot: repositories.snapshot(), clients: repositories.clients.list(), tasks: repositories.tasks.listAll() });
      return;
    }

    if (url.pathname === "/api/database/overview") {
      if (!requireViewer(request, response)) {
        return;
      }
      const clients = repositories.clients.list().map((client) => {
        const outputs = repositories.outputs.listByClient(client.clientId);
        return { client, stats: summarizeOutputs(outputs), latestOutput: outputs[0] ?? null };
      });
      sendJson(response, 200, { ok: true, clients });
      return;
    }

    if (url.pathname === "/api/demo/catalog") {
      if (!requireViewer(request, response)) {
        return;
      }
      sendJson(response, 200, {
        ok: true,
        clients: repositories.clients.list().map((client) => ({
          clientId: client.clientId,
          name: client.name,
          industry: client.industry
        })),
        skills: repositories.skills.list().map((skill) => ({
          skillId: skill.skillId,
          name: skill.name,
          category: skill.category
        }))
      });
      return;
    }

    if (url.pathname === "/api/demo/cost-snapshot") {
      if (!requireViewer(request, response)) {
        return;
      }
      sendJson(response, 200, {
        ok: true,
        ...getTodaySnapshot(repositories.costLedger)
      });
      return;
    }

    if (markdownImportMatch && request.method === "POST") {
      if (!requireOperator(request, response)) {
        return;
      }
      try {
        const clientId = decodeURIComponent(markdownImportMatch[1] ?? "");
        const payload = await readJsonBody(request);
        const result = importMarkdown(repositories, clientId, payload as { filename: string; markdown: string });
        sendJson(response, 201, { ok: true, clientId, taskId: result.task.taskId, outputId: result.output.outputId, title: result.output.title });
      } catch (error) {
        sendErrorResponse(response, 400, "INVALID_REQUEST", error instanceof Error ? error.message : "Markdown 匯入格式錯誤。");
      }
      return;
    }

    if (clientApiMatch && request.method === "GET") {
      if (!requireViewer(request, response)) {
        return;
      }
      const clientId = decodeURIComponent(clientApiMatch[1] ?? "");
      const client = repositories.clients.getById(clientId);
      if (!client) {
        sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定客戶。");
        return;
      }
      sendJson(response, 200, buildClientApiPayload(repositories, client));
      return;
    }

    if (brandBrainBuilderUploadMatch && request.method === "POST") {
      if (!requireOperator(request, response)) {
        return;
      }
      try {
        const clientId = decodeURIComponent(brandBrainBuilderUploadMatch[1] ?? "");
        const client = repositories.clients.getById(clientId);
        if (!client) {
          sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定 client");
          return;
        }

        const payload = brandBrainUploadSchema.parse(await readJsonBody(request));
        const uploadedAt = new Date().toISOString();
        const uploaded = payload.docs.map((doc) => {
          if (!isSupportedBrandBrainFilename(doc.filename)) {
            throw new Error(`UNSUPPORTED_FORMAT:${doc.filename}`);
          }

          const normalized = truncateBrandDataroomContent(doc.content);
          const record: BrandDataroomDoc = {
            id: randomUUID(),
            clientId,
            docType: doc.docType,
            filename: doc.filename,
            content: normalized.content,
            contentLength: normalized.contentLength,
            truncated: normalized.truncated,
            uploadedAt,
            uploadedBy: request.context.actor.alias
          };
          repositories.brandDataroom.create(record);
          return {
            docType: record.docType,
            filename: record.filename,
            contentLength: record.contentLength,
            truncated: record.truncated
          };
        });

        sendJson(response, 201, { ok: true, uploaded });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("UNSUPPORTED_FORMAT:")) {
          sendErrorResponse(response, 400, "UNSUPPORTED_FORMAT", `不支援的檔案格式：${error.message.slice("UNSUPPORTED_FORMAT:".length)}`);
          return;
        }
        sendKnownError(response, error, "品牌文件上傳失敗");
      }
      return;
    }

    if (brandBrainBuilderGenerateMatch && request.method === "POST") {
      if (!requireOperator(request, response) || !requireCostConfirmation(request, response)) {
        return;
      }
      try {
        const clientId = decodeURIComponent(brandBrainBuilderGenerateMatch[1] ?? "");
        const client = repositories.clients.getById(clientId);
        if (!client) {
          sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定 client");
          return;
        }

        const docs = repositories.brandDataroom.listByClientId(clientId);
        if (docs.length === 0) {
          throw new NoDocumentsUploadedError();
        }

        // 使用 NDJSON streaming 避免 Zeabur gateway timeout（每步推送進度）
        // 零 token 組裝模式（不呼叫 Claude API，< 1 秒完成）
        const result = assembleBrandBrain(client.name, docs);
        sendJson(response, 200, { ok: true, ...result });
      } catch (error) {
        sendKnownError(response, error, "品牌腦組裝失敗");
      }
      return;
    }

    if (brandBrainBuilderConfirmMatch && request.method === "PUT") {
      if (!requireOperator(request, response)) {
        return;
      }
      try {
        const clientId = decodeURIComponent(brandBrainBuilderConfirmMatch[1] ?? "");
        const client = repositories.clients.getById(clientId);
        if (!client) {
          sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定 client");
          return;
        }

        const payload = brandBrainConfirmSchema.parse(await readJsonBody(request));
        const current = repositories.brandBrains.getByClientId(clientId);
        const brandBrain = buildBrandBrainToSave(client, current, payload);
        repositories.brandBrains.save(brandBrain);
        repositories.traces.save({
          traceId: randomUUID(),
          taskId: null,
          clientId,
          phase: "onboarding",
          stepName: "brand_brain_builder.confirm",
          inputSummary: previewText(`agents=4;strategyNotes=${payload.strategyNotes.length}`, 240),
          outputSummary: previewText(`brainId=${brandBrain.brainId};version=${brandBrain.version}`, 240),
          startedAt: brandBrain.lastUpdated,
          endedAt: brandBrain.lastUpdated,
          errorCode: null
        });

        sendJson(response, 200, { ok: true, brainId: brandBrain.brainId, version: brandBrain.version });
      } catch (error) {
        sendKnownError(response, error, "品牌腦確認存入失敗");
      }
      return;
    }

    if (brandBrainBuilderGetMatch && request.method === "GET") {
      if (!requireOperator(request, response)) {
        return;
      }
      const clientId = decodeURIComponent(brandBrainBuilderGetMatch[1] ?? "");
      const client = repositories.clients.getById(clientId);
      if (!client) {
        sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定 client");
        return;
      }
      sendJson(response, 200, buildBrandBrainBuilderPayload(repositories, client));
      return;
    }

    // ===== /brand-brain-builder/:clientId SSR 頁面 =====
    if (brandBrainBuilderPageMatch) {
      const clientId = decodeURIComponent(brandBrainBuilderPageMatch[1] ?? "");
      const client = repositories.clients.getById(clientId);
      if (!client) {
        sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定 client");
        return;
      }
      sendHtml(response, renderBrandBrainBuilder({
        client,
        brandBrain: repositories.brandBrains.getByClientId(client.clientId),
        dataroom: repositories.brandDataroom.listByClientId(client.clientId),
        viewerAlias: (request as IncomingMessage & { context?: { actor: Actor | null } }).context?.actor?.alias ?? ""
      }));
      return;
    }

    if (url.pathname === "/api/clients") {
      if (!requireViewer(request, response)) {
        return;
      }
      sendJson(response, 200, { ok: true, clients: repositories.clients.list() });
      return;
    }

    if (url.pathname === "/api/members" && request.method === "GET") {
      if (!requireViewer(request, response)) {
        return;
      }
      const visibleMembers =
        request.context.actor.role === "admin"
          ? repositories.teamMembers.listAll()
          : repositories.teamMembers.listAll().filter((member) => member.alias === request.context.actor.alias);
      sendJson(response, 200, {
        ok: true,
        members: visibleMembers.map((member) => buildMemberOverview(repositories, member))
      });
      return;
    }

    if (memberDetailMatch && request.method === "GET") {
      if (!requireViewer(request, response)) {
        return;
      }
      try {
        const alias = decodeURIComponent(memberDetailMatch[1] ?? "");
        if (!canAccessMember(request.context.actor, alias)) {
          sendErrorResponse(response, 403, "FORBIDDEN_MEMBER_ACCESS", "不可查看其他成員資料");
          return;
        }
        const member = findMemberByAliasOrNull(repositories, alias);
        if (!member) {
          sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定成員");
          return;
        }
        const snapshot = getMemberSnapshot(repositories, member.memberId);
        const since = url.searchParams.get("since");
        const skillId = url.searchParams.get("skillId");
        const verdict = url.searchParams.get("verdict");
        const activities = repositories.memberActivity.listByMemberId(member.memberId, {
          ...(since ? { since } : {}),
          ...(skillId ? { skillId } : {}),
          ...(verdict ? { verdict } : {}),
          limit: parseLimit(url.searchParams.get("limit"))
        });
        sendJson(response, 200, {
          ok: true,
          member,
          quota: repositories.memberQuotas.getByMemberId(member.memberId),
          snapshot,
          activities
        });
      } catch (error) {
        sendKnownError(response, error, "讀取成員資料失敗");
      }
      return;
    }

    if (memberQuotaMatch && request.method === "PUT") {
      if (!requireAdmin(request, response)) {
        return;
      }
      try {
        const alias = decodeURIComponent(memberQuotaMatch[1] ?? "");
        const member = findMemberByAliasOrNull(repositories, alias);
        if (!member) {
          sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定成員");
          return;
        }
        const payload = (await readJsonBody(request)) as {
          dailyUsd?: unknown;
          weeklyUsd?: unknown;
          monthlyUsd?: unknown;
          taskCountDailyTarget?: unknown;
        };
        const existing = repositories.memberQuotas.getByMemberId(member.memberId);
        const now = new Date().toISOString();
        const nextDailyUsd = parseOptionalMoney(payload.dailyUsd, "dailyUsd");
        const nextWeeklyUsd = parseOptionalMoney(payload.weeklyUsd, "weeklyUsd");
        const nextMonthlyUsd = parseOptionalMoney(payload.monthlyUsd, "monthlyUsd");
        const nextTaskCountDailyTarget = parseOptionalPositiveInt(payload.taskCountDailyTarget, "taskCountDailyTarget");
        const quota: MemberQuota = {
          memberId: member.memberId,
          dailyUsd: nextDailyUsd === undefined ? existing?.dailyUsd ?? null : nextDailyUsd,
          weeklyUsd: nextWeeklyUsd === undefined ? existing?.weeklyUsd ?? null : nextWeeklyUsd,
          monthlyUsd: nextMonthlyUsd === undefined ? existing?.monthlyUsd ?? null : nextMonthlyUsd,
          taskCountDailyTarget:
            nextTaskCountDailyTarget === undefined ? existing?.taskCountDailyTarget ?? null : nextTaskCountDailyTarget,
          updatedAt: now,
          updatedBy: request.context.actor.alias
        };
        repositories.memberQuotas.upsert(quota);
        writeMemberTrace(
          repositories,
          request.context.actor,
          "member.quota.updated",
          `alias=${alias};memberId=${member.memberId}`,
          `daily=${quota.dailyUsd};weekly=${quota.weeklyUsd};monthly=${quota.monthlyUsd};target=${quota.taskCountDailyTarget}`
        );
        sendJson(response, 200, { ok: true, quota });
      } catch (error) {
        sendKnownError(response, error, "更新成員 quota 失敗");
      }
      return;
    }

    if (memberStatusMatch && request.method === "PUT") {
      if (!requireAdmin(request, response)) {
        return;
      }
      try {
        const alias = decodeURIComponent(memberStatusMatch[1] ?? "");
        const member = findMemberByAliasOrNull(repositories, alias);
        if (!member) {
          sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定成員");
          return;
        }
        const payload = (await readJsonBody(request)) as { status?: unknown };
        if (payload.status !== "active" && payload.status !== "paused" && payload.status !== "archived") {
          throw new Error("status 必須是 active、paused 或 archived");
        }
        repositories.teamMembers.updateStatus(member.memberId, payload.status);
        const updated = repositories.teamMembers.getById(member.memberId);
        writeMemberTrace(
          repositories,
          request.context.actor,
          "member.status.updated",
          `alias=${alias};memberId=${member.memberId}`,
          `status=${payload.status}`
        );
        sendJson(response, 200, { ok: true, member: updated });
      } catch (error) {
        sendKnownError(response, error, "更新成員狀態失敗");
      }
      return;
    }

    if (memberNoteMatch && request.method === "POST") {
      if (!requireAdmin(request, response)) {
        return;
      }
      try {
        const alias = decodeURIComponent(memberNoteMatch[1] ?? "");
        const member = findMemberByAliasOrNull(repositories, alias);
        if (!member) {
          sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定成員");
          return;
        }
        const payload = (await readJsonBody(request)) as { note?: unknown };
        const noteText = typeof payload.note === "string" ? payload.note.trim() : "";
        if (!noteText) {
          throw new Error("note 不可空白");
        }
        const note: MemberNote = {
          text: noteText,
          createdAt: new Date().toISOString(),
          createdBy: request.context.actor.alias
        };
        const updated = repositories.teamMembers.appendNote(member.memberId, note);
        writeMemberTrace(
          repositories,
          request.context.actor,
          "member.note.added",
          `alias=${alias};memberId=${member.memberId}`,
          `note=${noteText}`
        );
        sendJson(response, 200, { ok: true, member: updated });
      } catch (error) {
        sendKnownError(response, error, "新增成員備註失敗");
      }
      return;
    }

    if (url.pathname === "/api/tier-rules" && request.method === "GET") {
      if (!requireViewer(request, response)) {
        return;
      }
      sendJson(response, 200, { ok: true, tiers: repositories.tierRules.listAll() });
      return;
    }

    if (url.pathname === "/api/tier-rules" && request.method === "PUT") {
      if (!requireAdmin(request, response)) {
        return;
      }
      try {
        const payload = (await readJsonBody(request)) as Partial<TierRule> & { dailyCap?: unknown };
        if (payload.tier !== "Bronze" && payload.tier !== "Silver" && payload.tier !== "Gold" && payload.tier !== "Platinum") {
          throw new Error("tier 必須是 Bronze、Silver、Gold 或 Platinum");
        }
        const existing = repositories.tierRules.getByTier(payload.tier);
        if (!existing) {
          throw new Error(`tier ${payload.tier} 不存在`);
        }
        const threshold = Number(payload.threshold);
        const dailyCap = Number(payload.dailyCap);
        if (!Number.isInteger(threshold) || threshold < 0) {
          throw new Error("threshold 必須是大於等於 0 的整數");
        }
        if (!Number.isInteger(dailyCap) || dailyCap < 0) {
          throw new Error("dailyCap 必須是大於等於 0 的整數");
        }
        const rule: TierRule = {
          tier: payload.tier,
          threshold,
          dailyCap,
          icon: typeof payload.icon === "string" && payload.icon.trim() ? payload.icon : existing.icon,
          displayName:
            typeof payload.displayName === "string" && payload.displayName.trim() ? payload.displayName : existing.displayName,
          updatedAt: new Date().toISOString(),
          updatedBy: request.context.actor.alias
        };
        repositories.tierRules.upsert(rule);
        writeMemberTrace(
          repositories,
          request.context.actor,
          "tier.rules.updated",
          `tier=${rule.tier}`,
          `threshold=${rule.threshold};dailyCap=${rule.dailyCap}`
        );
        sendJson(response, 200, { ok: true, tier: rule });
      } catch (error) {
        sendKnownError(response, error, "更新 tier 規則失敗");
      }
      return;
    }

    if (url.pathname === "/api/ramp-up/current" && request.method === "GET") {
      if (!requireViewer(request, response)) {
        return;
      }
      sendJson(response, 200, { ok: true, rampUp: getCurrentRampUp(repositories) });
      return;
    }

    if (url.pathname === "/api/ramp-up" && request.method === "POST") {
      if (!requireAdmin(request, response)) {
        return;
      }
      try {
        const payload = (await readJsonBody(request)) as { durationDays?: unknown; multiplier?: unknown; reason?: unknown };
        const durationDays = Number(payload.durationDays);
        const multiplier = Number(payload.multiplier);
        const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
        if (!Number.isInteger(durationDays) || durationDays <= 0) {
          throw new Error("durationDays 必須是正整數");
        }
        if (!Number.isFinite(multiplier) || multiplier <= 0) {
          throw new Error("multiplier 必須是大於 0 的數字");
        }
        if (!reason) {
          throw new Error("reason 不可空白");
        }
        const createdAt = new Date().toISOString();
        const rampUp = {
          id: `rampup_${randomUUID()}`,
          startDate: createdAt,
          endDate: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
          multiplier,
          reason,
          createdAt,
          createdBy: request.context.actor.alias
        };
        repositories.rampUps.create(rampUp);
        writeMemberTrace(repositories, request.context.actor, "rampup.started", `multiplier=${multiplier};days=${durationDays}`, reason);
        sendJson(response, 201, { ok: true, rampUp: getCurrentRampUp(repositories) });
      } catch (error) {
        sendKnownError(response, error, "啟動 ramp-up 失敗");
      }
      return;
    }

    if (walletGrantMatch && request.method === "POST") {
      if (!requireAdmin(request, response)) {
        return;
      }
      try {
        const alias = decodeURIComponent(walletGrantMatch[1] ?? "");
        const member = findMemberByAliasOrNull(repositories, alias);
        if (!member) {
          sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定成員");
          return;
        }
        const payload = (await readJsonBody(request)) as { amount?: unknown; reason?: unknown };
        const amount = Number(payload.amount);
        const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
        if (!Number.isInteger(amount) || amount <= 0) {
          throw new Error("amount 必須是正整數");
        }
        if (!reason) {
          throw new Error("reason 不可空白");
        }
        const result = grantTokens(repositories, member.memberId, amount, reason, request.context.actor.alias);
        writeMemberTrace(repositories, request.context.actor, "wallet.grant", `alias=${alias};amount=${amount}`, reason);
        sendJson(response, 200, { ok: true, wallet: result.wallet, transaction: result.transaction, promotion: result.promotion });
      } catch (error) {
        sendKnownError(response, error, "Grant token 失敗");
      }
      return;
    }

    if (walletPenaltyMatch && request.method === "POST") {
      if (!requireAdmin(request, response)) {
        return;
      }
      try {
        const alias = decodeURIComponent(walletPenaltyMatch[1] ?? "");
        const member = findMemberByAliasOrNull(repositories, alias);
        if (!member) {
          sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定成員");
          return;
        }
        const payload = (await readJsonBody(request)) as { amount?: unknown; reason?: unknown };
        const amount = Number(payload.amount);
        const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
        if (!Number.isInteger(amount) || amount <= 0) {
          throw new Error("amount 必須是正整數");
        }
        if (!reason) {
          throw new Error("reason 不可空白");
        }
        const result = penaltyTokens(repositories, member.memberId, amount, reason, request.context.actor.alias);
        writeMemberTrace(repositories, request.context.actor, "wallet.penalty", `alias=${alias};amount=${amount}`, reason);
        sendJson(response, 200, { ok: true, wallet: result.wallet, transaction: result.transaction });
      } catch (error) {
        sendKnownError(response, error, "Penalty token 失敗");
      }
      return;
    }

    if (walletHistoryMatch && request.method === "GET") {
      if (!requireViewer(request, response)) {
        return;
      }
      try {
        const alias = decodeURIComponent(walletHistoryMatch[1] ?? "");
        if (!canAccessMember(request.context.actor, alias)) {
          sendErrorResponse(response, 403, "FORBIDDEN_MEMBER_ACCESS", "不可查看其他成員錢包");
          return;
        }
        const member = findMemberByAliasOrNull(repositories, alias);
        if (!member) {
          sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定成員");
          return;
        }
        const wallet = repositories.wallets.getByMemberId(member.memberId) ?? ensureWalletForMember(repositories, member.memberId);
        const tierRule = repositories.tierRules.getByTier(wallet.tier);
        const since = url.searchParams.get("since");
        const type = url.searchParams.get("type");
        const transactions = repositories.walletTransactions.listByMemberId(member.memberId, {
          ...(since ? { since } : {}),
          ...(type ? { type: type as never } : {}),
          limit: parseLimit(url.searchParams.get("limit") ?? "50")
        });
        sendJson(response, 200, {
          ok: true,
          wallet: {
            balance: wallet.balance,
            lifetimeEarned: wallet.lifetimeEarned,
            lifetimeSpent: wallet.lifetimeSpent,
            tier: wallet.tier,
            tierIcon: tierRule?.icon ?? "",
            currentStreakDays: wallet.currentStreakDays,
            lastDailyBonusAt: wallet.lastDailyBonusAt
          },
          transactions
        });
      } catch (error) {
        sendKnownError(response, error, "讀取 wallet history 失敗");
      }
      return;
    }

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      if (!requireViewer(request, response)) {
        return;
      }
      try {
        const rawPeriod = url.searchParams.get("period") ?? "this_month";
        if (rawPeriod !== "this_month" && rawPeriod !== "this_week" && rawPeriod !== "lifetime") {
          throw new Error("period 必須是 this_month、this_week 或 lifetime");
        }
        const limit = parseLimit(url.searchParams.get("limit") ?? "10");
        sendJson(response, 200, {
          ok: true,
          period: rawPeriod,
          generatedAt: new Date().toISOString(),
          entries: buildLeaderboardEntries(repositories, rawPeriod, limit)
        });
      } catch (error) {
        sendKnownError(response, error, "讀取 leaderboard 失敗");
      }
      return;
    }

    if (url.pathname === "/api/onboarding/sample" && request.method === "POST") {
      if (!requireOperator(request, response) || !requireCostConfirmation(request, response)) {
        return;
      }
      try {
        const result = await runSampleOnboarding(repositories, formsAdapter, {
          actorAlias: request.context.actor.alias
        });
        sendJson(response, 200, { ok: true, clientId: result.client.clientId, brainId: result.brandBrain.brainId, snapshot: repositories.snapshot() });
      } catch (error) {
        sendKnownError(response, error, "Sample onboarding 執行失敗。");
      }
      return;
    }

    if (url.pathname === "/api/onboarding" && request.method === "POST") {
      if (!requireOperator(request, response) || !requireCostConfirmation(request, response)) {
        return;
      }
      try {
        const payload = await readJsonBody(request);
        const result = await createOnboarding(repositories, formsAdapter, payload, {
          actorAlias: request.context.actor.alias
        });
        sendJson(response, 201, { ok: true, clientId: result.client.clientId, brandName: result.client.name, googleFormUrl: result.client.googleFormUrl, brainId: result.brandBrain.brainId, snapshot: repositories.snapshot() });
      } catch (error) {
        sendKnownError(response, error, "Onboarding 請求格式錯誤。");
      }
      return;
    }

    if (url.pathname === "/onboarding") {
      sendHtml(response, renderOnboardingPage());
      return;
    }

    if (url.pathname === "/demo") {
      if (!requireViewer(request, response)) {
        return;
      }
      sendHtml(
        response,
        renderDemoConsole({
          viewerAlias: request.context.actor.alias,
          catalog: {
            clients: repositories.clients.list().map((client) => ({
              clientId: client.clientId,
              name: client.name,
              industry: client.industry
            })),
            skills: repositories.skills.list().map((skill) => ({
              skillId: skill.skillId,
              name: skill.name,
              category: skill.category
            }))
          },
          costSnapshot: getTodaySnapshot(repositories.costLedger)
        })
      );
      return;
    }

    if (url.pathname === "/demo/compare") {
      if (!requireViewer(request, response)) {
        return;
      }
      sendHtml(
        response,
        renderDemoCompare({
          viewerAlias: request.context.actor.alias,
          catalog: {
            clients: repositories.clients.list().map((client) => ({
              clientId: client.clientId,
              name: client.name,
              industry: client.industry
            })),
            skills: repositories.skills.list().map((skill) => ({
              skillId: skill.skillId,
              name: skill.name,
              category: skill.category
            }))
          },
          costSnapshot: getTodaySnapshot(repositories.costLedger)
        })
      );
      return;
    }

    // ===== /members SSR 頁面 =====
    if (url.pathname === "/members") {
      const actor = (request as IncomingMessage & { context?: { actor: Actor | null } }).context?.actor;
      const isAdmin = actor?.role === "admin";
      const allMembers = repositories.teamMembers.listAll();
      const visibleMembers = isAdmin ? allMembers : allMembers.filter((m) => m.alias === actor?.alias);
      const rows: MemberOverviewRow[] = visibleMembers.map((member) => {
        const snapshot = getMemberSnapshot(repositories, member.memberId);
        const wallet = repositories.wallets?.getByMemberId(member.memberId);
        const tierRule = wallet ? repositories.tierRules?.getByTier(wallet.tier) : null;
        const monthPrefix = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" }).format(new Date()).replace("/", "-");
        const monthlyEarn = wallet ? (repositories.walletTransactions?.getMonthlyEarn(member.memberId, monthPrefix) ?? 0) : 0;
        const todayDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        const todaySpend = wallet ? (repositories.walletTransactions?.getTodaySpend(member.memberId, todayDate) ?? 0) : 0;
        return {
          memberId: member.memberId,
          alias: member.alias,
          displayName: member.displayName,
          role: member.role,
          status: member.status,
          today: snapshot.today,
          thisWeek: snapshot.thisWeek,
          thisMonth: snapshot.thisMonth,
          lastActiveAt: snapshot.lastActiveAt,
          statusHint: snapshot.statusHint,
          tier: wallet?.tier ?? "Bronze",
          tierIcon: tierRule?.icon ?? "🥉",
          lifetimeEarned: wallet?.lifetimeEarned ?? 0,
          monthlyEarn,
          balance: wallet?.balance ?? 0,
          dailyCap: tierRule?.dailyCap ?? 5000,
          todayTokenSpend: todaySpend
        };
      });
      sendHtml(response, renderMembersOverview({
        members: rows,
        viewerAlias: actor?.alias ?? "",
        viewerRole: actor?.role ?? "viewer"
      }));
      return;
    }

    // ===== /leaderboard SSR 頁面 =====
    if (url.pathname === "/leaderboard") {
      const rawPeriod = url.searchParams.get("period") ?? "this_month";
      const period = (rawPeriod === "this_week" || rawPeriod === "lifetime") ? rawPeriod : "this_month";
      const entries = buildLeaderboardEntries(repositories, period, 20);
      const rampUp = getCurrentRampUp(repositories);
      const totalTeamEarn = entries.reduce((s, e) => s + e.earnThisPeriod, 0);
      sendHtml(response, renderLeaderboard({
        period,
        entries,
        rampUp: rampUp ? { multiplier: rampUp.multiplier, daysLeft: rampUp.daysLeft, reason: rampUp.reason } : null,
        totalTeamEarn
      }));
      return;
    }

    // ===== Brain Meeting API =====
    if (url.pathname === "/api/brain-meeting/start" && request.method === "POST") {
      if (!requireOperator(request, response) || !requireCostConfirmation(request, response)) {
        return;
      }
      try {
        const payload = (await readJsonBody(request)) as Record<string, unknown>;
        const clientId = typeof payload.clientId === "string" ? payload.clientId : "";
        const title = typeof payload.title === "string" ? payload.title : "行銷任務";
        const mode = payload.mode === "full_dispatch" ? "full_dispatch" as const : "consultation" as const;

        const client = repositories.clients.getById(clientId);
        if (!client) {
          sendErrorResponse(response, 404, "CLIENT_NOT_FOUND", `找不到客戶 ${clientId}`);
          return;
        }
        const brandBrain = repositories.brandBrains.getByClientId(clientId);
        if (!brandBrain) {
          sendErrorResponse(response, 404, "BRAND_BRAIN_NOT_FOUND", `客戶 ${clientId} 尚未建立品牌腦`);
          return;
        }

        const strategy = createStrategyBrain([
          "Preserve SOSTAC discipline.",
          "Keep outputs concise, auditable, and client-ready."
        ]);
        const masterBrain = loadMasterBrain(repositories);
        const taskAttrs: MasterBrainTaskAttrs = {
          industry: client.industry,
          channel: "social",
          tags: [client.industry]
        };
        // Reference injection：替換品牌腦 {{ref:xxx}} 佔位符
        const resolvedBrain = resolveReferences(brandBrain, { type: "content" }, repositories.brandDataroom);
        const runtimeBrain = mergeThreeBrains(strategy, masterBrain, resolvedBrain, taskAttrs);

        // 啟動會議（同步開始但不等結束），立即回傳 meetingId
        const meetingId = randomUUID();
        repositories.brainMeetings.create({
          meetingId,
          clientId,
          mode,
          status: "running",
          startedAt: new Date().toISOString()
        });

        // 背景執行腦會議，傳入 meetingId 避免重複建立
        runBrainMeeting(client, title, resolvedBrain, runtimeBrain, repositories, mode, undefined, meetingId).catch(err => {
          console.error(`[brain-meeting] ${meetingId} failed:`, err);
          repositories.brainMeetings.updateStatus(meetingId, "error", new Date().toISOString());
        });

        sendJson(response, 201, { ok: true, meetingId });
      } catch (error) {
        sendKnownError(response, error, "Brain meeting 啟動失敗。");
      }
      return;
    }

    const brainMeetingStreamMatch = url.pathname.match(/^\/api\/brain-meeting\/([^/]+)\/stream$/);
    if (brainMeetingStreamMatch && request.method === "GET") {
      const meetingId = brainMeetingStreamMatch[1]!;
      const meeting = repositories.brainMeetings.getById(meetingId);
      if (!meeting) {
        sendErrorResponse(response, 404, "MEETING_NOT_FOUND", `找不到腦會議 ${meetingId}`);
        return;
      }

      // SSE 回應
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*"
      });

      // 傳送已有的訊息
      const existingMessages = repositories.brainMeetingMessages.listByMeetingId(meetingId);
      for (const msg of existingMessages) {
        const sseData = JSON.stringify({
          phase: msg.phase,
          role: msg.role,
          displayName: msg.role === "strategy" ? "双云策略腦" : msg.role === "master" ? "師傅腦" : "品牌腦",
          icon: msg.role === "strategy" ? "🧠" : msg.role === "master" ? "🎓" : "🏷️",
          content: msg.content,
          round: msg.round,
          isLast: false
        });
        response.write(`data: ${sseData}\n\n`);
      }

      // 如果已結束，推 done
      if (meeting.status === "done" || meeting.status === "error") {
        response.write(`data: ${JSON.stringify({ type: "done", meetingId, status: meeting.status })}\n\n`);
        response.end();
        return;
      }

      // 輪詢等新訊息（最多 60 秒）
      let elapsed = 0;
      const pollInterval = setInterval(() => {
        elapsed += 2000;
        const currentMeeting = repositories.brainMeetings.getById(meetingId);
        const msgs = repositories.brainMeetingMessages.listByMeetingId(meetingId);
        // 推送新訊息
        if (msgs.length > existingMessages.length) {
          for (let i = existingMessages.length; i < msgs.length; i++) {
            const msg = msgs[i]!;
            const sseData = JSON.stringify({
              phase: msg.phase,
              role: msg.role,
              displayName: msg.role === "strategy" ? "双云策略腦" : msg.role === "master" ? "師傅腦" : "品牌腦",
              icon: msg.role === "strategy" ? "🧠" : msg.role === "master" ? "🎓" : "🏷️",
              content: msg.content,
              round: msg.round,
              isLast: msg.phase === "synthesis"
            });
            response.write(`data: ${sseData}\n\n`);
          }
          existingMessages.length = msgs.length;
        }
        if (currentMeeting?.status === "done" || currentMeeting?.status === "error" || elapsed >= 120000) {
          response.write(`data: ${JSON.stringify({ type: "done", meetingId, status: currentMeeting?.status ?? "timeout" })}\n\n`);
          clearInterval(pollInterval);
          response.end();
        }
      }, 2000);

      request.on("close", () => {
        clearInterval(pollInterval);
      });
      return;
    }

    const brainMeetingReportMatch = url.pathname.match(/^\/api\/brain-meeting\/([^/]+)\/report$/);
    if (brainMeetingReportMatch && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      const meetingId = brainMeetingReportMatch[1]!;
      const meeting = repositories.brainMeetings.getById(meetingId);
      if (!meeting) {
        sendErrorResponse(response, 404, "MEETING_NOT_FOUND", `找不到腦會議 ${meetingId}`);
        return;
      }
      const messages = repositories.brainMeetingMessages.listByMeetingId(meetingId);
      sendJson(response, 200, { ok: true, meeting, messages });
      return;
    }

    // ===== Marketplace API =====
    if (url.pathname === "/api/marketplace/skills" && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      const categoryParam = url.searchParams.get("category");
      const skills = repositories.marketplaceSkills.list(categoryParam ? { category: categoryParam, status: "published" } : { status: "published" });
      sendJson(response, 200, { ok: true, skills });
      return;
    }

    if (url.pathname === "/api/marketplace/skills" && request.method === "POST") {
      if (!requireOperator(request, response)) return;
      try {
        const payload = (await readJsonBody(request)) as Record<string, unknown>;
        const skill = {
          skillId: (typeof payload.skillId === "string" ? payload.skillId : null) ?? randomUUID(),
          publisherAlias: request.context.actor.alias,
          publisherMemberId: undefined,
          category: (typeof payload.category === "string" ? payload.category : null) ?? "content_writing",
          name: (typeof payload.name === "string" ? payload.name : null) ?? "Unnamed Skill",
          description: (typeof payload.description === "string" ? payload.description : null) ?? "",
          promptPreview: typeof payload.promptPreview === "string" ? payload.promptPreview : undefined,
          installCount: 0,
          status: "published" as const,
          version: (typeof payload.version === "string" ? payload.version : null) ?? "1.0.0",
          publishedAt: new Date().toISOString()
        };
        repositories.marketplaceSkills.create(skill);
        sendJson(response, 201, { ok: true, skillId: skill.skillId });
      } catch (error) {
        sendKnownError(response, error, "Skill 發佈失敗。");
      }
      return;
    }

    const marketplaceSkillMatch = url.pathname.match(/^\/api\/marketplace\/skills\/([^/]+)$/);
    if (marketplaceSkillMatch && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      const skill = repositories.marketplaceSkills.getById(marketplaceSkillMatch[1]!);
      if (!skill) {
        sendErrorResponse(response, 404, "SKILL_NOT_FOUND", "找不到此 Skill");
        return;
      }
      sendJson(response, 200, { ok: true, skill });
      return;
    }

    const marketplaceInstallMatch = url.pathname.match(/^\/api\/marketplace\/skills\/([^/]+)\/install$/);
    if (marketplaceInstallMatch && request.method === "POST") {
      if (!requireOperator(request, response)) return;
      const skillId = marketplaceInstallMatch[1]!;

      // 先查 marketplace_skills 表
      const mpSkill = repositories.marketplaceSkills.getById(skillId);
      if (mpSkill) {
        if (!repositories.skills.findById(skillId)) {
          repositories.skills.save({
            skillId: mpSkill.skillId,
            name: mpSkill.name,
            category: mpSkill.category as import("@shuangyun/shared-types").SkillCategory,
            kind: "workflow",
            inputSchema: { type: "object", properties: {} },
            outputSchema: { type: "object", properties: {} },
            blocks: [{ blockId: "main", name: mpSkill.name, type: "skill" as const, systemPrompt: mpSkill.promptPreview ?? `你是 ${mpSkill.name}` }],
            isShared: false,
            version: mpSkill.version,
            description: mpSkill.description
          });
        }
        repositories.marketplaceSkills.incrementInstalls(skillId);
        sendJson(response, 200, { ok: true, installed: true });
        return;
      }

      // 如果 marketplace_skills 找不到，但 skills 表已有 → 代表已安裝（系統內建 skill）
      const existingSkill = repositories.skills.findById(skillId);
      if (existingSkill) {
        sendJson(response, 200, { ok: true, installed: true, message: "此 Skill 已安裝（系統內建）。" });
        return;
      }

      sendErrorResponse(response, 404, "SKILL_NOT_FOUND", "找不到此 Skill");
      return;
    }

    const marketplaceDeleteMatch = url.pathname.match(/^\/api\/marketplace\/skills\/([^/]+)$/);
    if (marketplaceDeleteMatch && request.method === "DELETE") {
      if (!requireAdmin(request, response)) return;
      repositories.marketplaceSkills.delete(marketplaceDeleteMatch[1]!);
      sendJson(response, 200, { ok: true, deleted: true });
      return;
    }

    if (url.pathname === "/marketplace") {
      // 系統內建 skills（已安裝）
      const installedSkills = repositories.skills.list().map(s => ({
        skillId: s.skillId,
        name: s.name,
        category: s.category ?? "content_writing",
        description: s.description ?? "",
        installCount: 0,
        version: s.version ?? "1.0.0",
        publisherAlias: "双云",
        status: "published",
        installed: true
      }));
      // Marketplace 上架但尚未安裝的 skills
      const mpSkills = repositories.marketplaceSkills.list({ status: "published" })
        .filter(mp => !repositories.skills.findById(mp.skillId))
        .map(mp => ({
          skillId: mp.skillId,
          name: mp.name,
          category: mp.category,
          description: mp.description,
          installCount: mp.installCount,
          version: mp.version,
          publisherAlias: mp.publisherAlias,
          status: mp.status,
          installed: false
        }));
      const skills = [...installedSkills, ...mpSkills];
      const actor = (request as IncomingMessage & { context?: { actor: Actor | null } }).context?.actor;
      sendHtml(response, renderMarketplace({
        skills,
        viewerAlias: actor?.alias ?? "guest",
        viewerRole: actor?.role ?? "viewer"
      }));
      return;
    }

    if (url.pathname === "/admin/brains") {
      const actor = (request as IncomingMessage & { context?: { actor: Actor | null } }).context?.actor;
      if (!actor || actor.role !== "admin") {
        sendErrorResponse(response, 403, "FORBIDDEN", "此頁面僅限 admin 存取。");
        return;
      }
      const clients = repositories.clients.list();
      const brandBrains: Array<{ client: Client; brain: BrandBrain }> = [];
      for (const client of clients) {
        const brain = repositories.brandBrains.getByClientId(client.clientId);
        if (brain) {
          brandBrains.push({ client, brain });
        }
      }
      sendHtml(response, renderAdminBrains({
        strategyDirectives: [
          "Preserve SOSTAC discipline.",
          "Keep outputs concise, auditable, and client-ready."
        ],
        masterCases: repositories.masterCases.listAll(),
        playbooks: repositories.playbooks.listAll(),
        brandBrains
      }));
      return;
    }

    // ===== Feedback API =====
    const feedbackMatch = url.pathname.match(/^\/api\/feedback\/([^/]+)$/);
    if (feedbackMatch && request.method === "POST") {
      if (!requireOperator(request, response)) return;
      try {
        const outputId = feedbackMatch[1]!;
        const payload = (await readJsonBody(request)) as Record<string, unknown>;
        const score = typeof payload.score === "number" ? payload.score : null;
        const userEdits = typeof payload.userEdits === "string" ? payload.userEdits : null;
        if (score !== null && repositories.feedbackHistory) {
          // 找到對應的 feedback_history 記錄並更新
          const output = repositories.outputs.getById(outputId);
          if (output) {
            const recent = repositories.feedbackHistory.listRecent(output.clientId, output.type, 1);
            if (recent.length > 0) {
              repositories.feedbackHistory.updateFeedback(recent[0]!.id, score, userEdits ?? "");
            }
          }
        }
        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendKnownError(response, error, "回饋儲存失敗");
      }
      return;
    }

    if (url.pathname === "/api/feedback/history" && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      const clientId = url.searchParams.get("clientId") || "";
      const taskType = url.searchParams.get("taskType") || "content";
      const history = repositories.feedbackHistory ? repositories.feedbackHistory.listRecent(clientId, taskType, 10) : [];
      sendJson(response, 200, { ok: true, history });
      return;
    }

    // ===== Skill Sync API =====
    if (url.pathname === "/api/skills/sync" && request.method === "POST") {
      if (!requireAdmin(request, response)) return;
      // TODO: 呼叫 syncSkillsFromDrive（等 Ch7 完成後串接）
      sendJson(response, 200, { ok: true, message: "Skill 同步功能準備中（待 Google Drive 整合完成）" });
      return;
    }

    // ===== Connector API =====
    if (url.pathname === "/api/connectors" && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      import("./connectors/index.js").then(m => {
        const connectors = m.listConnectors().map(c => ({
          id: c.id, category: c.category, name: c.name,
          available: c.isAvailable()
        }));
        sendJson(response, 200, { ok: true, connectors });
      }).catch(() => sendJson(response, 200, { ok: true, connectors: [] }));
      return;
    }

    // ===== Workflow API =====
    if (url.pathname === "/api/workflows" && request.method === "POST") {
      if (!requireOperator(request, response)) return;
      try {
        const payload = (await readJsonBody(request)) as Record<string, unknown>;
        const workflowId = randomUUID();
        const now = new Date().toISOString();
        repositories.workflows.create({
          workflowId,
          name: typeof payload.name === "string" ? payload.name : "未命名工作流",
          clientId: typeof payload.clientId === "string" ? payload.clientId : "",
          nodes: Array.isArray(payload.nodes) ? payload.nodes as import("@shuangyun/shared-types").WorkflowNode[] : [],
          edges: Array.isArray(payload.edges) ? payload.edges as import("@shuangyun/shared-types").WorkflowEdge[] : [],
          createdBy: request.context.actor.alias,
          version: 1,
          createdAt: now,
          updatedAt: now
        });
        sendJson(response, 201, { ok: true, workflowId });
      } catch (error) {
        sendKnownError(response, error, "建立工作流失敗");
      }
      return;
    }

    if (url.pathname === "/api/workflows" && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      const list = repositories.workflows.list().map(w => ({
        workflowId: w.workflowId, name: w.name, clientId: w.clientId,
        nodeCount: w.nodes.length, version: w.version, createdBy: w.createdBy, updatedAt: w.updatedAt
      }));
      sendJson(response, 200, { ok: true, workflows: list });
      return;
    }

    const workflowApiMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)$/);
    if (workflowApiMatch && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      const wf = repositories.workflows.getById(workflowApiMatch[1]!);
      if (!wf) { sendErrorResponse(response, 404, "NOT_FOUND", "找不到工作流"); return; }
      sendJson(response, 200, { ok: true, ...wf });
      return;
    }

    if (workflowApiMatch && request.method === "PUT") {
      if (!requireOperator(request, response)) return;
      const wfId = workflowApiMatch[1]!;
      try {
        const payload = (await readJsonBody(request)) as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        if (typeof payload.name === "string") patch.name = payload.name;
        if (typeof payload.clientId === "string") patch.clientId = payload.clientId;
        if (Array.isArray(payload.nodes)) patch.nodes = payload.nodes;
        if (Array.isArray(payload.edges)) patch.edges = payload.edges;
        repositories.workflows.update(wfId, patch as Parameters<typeof repositories.workflows.update>[1]);
        const updated = repositories.workflows.getById(wfId);
        sendJson(response, 200, { ok: true, workflowId: wfId, version: updated?.version ?? 1 });
      } catch (error) {
        sendKnownError(response, error, "更新工作流失敗");
      }
      return;
    }

    if (workflowApiMatch && request.method === "DELETE") {
      if (!requireAdmin(request, response)) return;
      repositories.workflows.delete(workflowApiMatch[1]!);
      sendJson(response, 200, { ok: true, deleted: true });
      return;
    }

    // Workflow 執行 API
    const workflowRunMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/run$/);
    if (workflowRunMatch && request.method === "POST") {
      if (!requireOperator(request, response) || !requireCostConfirmation(request, response)) return;
      const wfId = workflowRunMatch[1]!;
      const wf = repositories.workflows.getById(wfId);
      if (!wf) { sendErrorResponse(response, 404, "NOT_FOUND", "找不到工作流"); return; }
      try {
        const { executeWorkflow } = await import("./runtime/workflow-engine.js");
        const result = await executeWorkflow(wf, repositories);
        sendJson(response, 200, { ok: true, executionId: result.executionId, steps: result.steps });
      } catch (error) {
        sendKnownError(response, error, "工作流執行失敗");
      }
      return;
    }

    const workflowExecsMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/executions$/);
    if (workflowExecsMatch && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      const execs = repositories.workflowExecutions.listByWorkflow(workflowExecsMatch[1]!);
      sendJson(response, 200, { ok: true, executions: execs });
      return;
    }

    const workflowExecDetailMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/executions\/([^/]+)$/);
    if (workflowExecDetailMatch && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      const exec = repositories.workflowExecutions.getById(workflowExecDetailMatch[2]!);
      if (!exec) { sendErrorResponse(response, 404, "NOT_FOUND", "找不到執行紀錄"); return; }
      const steps = repositories.workflowExecutionSteps.listByExecution(exec.executionId);
      sendJson(response, 200, { ok: true, execution: exec, steps });
      return;
    }

    // ===== Workflow SSR 頁面 =====
    if (url.pathname === "/workflows") {
      if (!requireViewer(request, response)) return;
      const wfList = repositories.workflows.list().map(w => ({
        workflowId: w.workflowId,
        name: w.name,
        clientName: repositories.clients.getById(w.clientId)?.name ?? w.clientId,
        nodeCount: w.nodes.length,
        version: w.version,
        createdBy: w.createdBy,
        updatedAt: w.updatedAt
      }));
      sendHtml(response, renderWorkflowList({
        workflows: wfList,
        viewerRole: (request as IncomingMessage & { context?: { actor: Actor | null } }).context?.actor?.role ?? "viewer"
      }));
      return;
    }

    const workflowBuilderMatch = url.pathname.match(/^\/workflows\/([^/]+)$/);
    if (workflowBuilderMatch) {
      if (!requireOperator(request, response)) return;
      const wfId = workflowBuilderMatch[1]!;
      const skills = repositories.skills.list().map(s => ({ skillId: s.skillId, name: s.name, category: s.category, kind: s.kind }));
      const clients = repositories.clients.list().map(c => ({ clientId: c.clientId, name: c.name }));
      const brandBrains = clients
        .map(c => {
          const brain = repositories.brandBrains.getByClientId(c.clientId);
          return brain ? { clientId: c.clientId, clientName: c.name, version: brain.version } : null;
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);
      const existingWf = wfId !== "new" ? repositories.workflows.getById(wfId) : null;
      sendHtml(response, renderWorkflowBuilder({
        workflowId: wfId === "new" ? null : wfId,
        workflowName: existingWf?.name ?? (wfId === "new" ? "" : wfId),
        clientId: existingWf?.clientId ?? clients[0]?.clientId ?? "",
        nodesJson: existingWf ? JSON.stringify(existingWf.nodes) : "[]",
        edgesJson: existingWf ? JSON.stringify(existingWf.edges) : "[]",
        skills,
        clients,
        brandBrains
      }));
      return;
    }

    // ===== Admin API =====
    if (url.pathname === "/api/admin/brains/strategy" && request.method === "PUT") {
      if (!requireAdmin(request, response)) return;
      // 策略腦 directives 更新（目前 hardcoded，此 API 為未來擴充預留）
      sendJson(response, 200, { ok: true, message: "策略腦 directives 目前為系統內建，未來版本支援自訂。" });
      return;
    }

    if (url.pathname === "/api/admin/brains/master-cases" && request.method === "GET") {
      if (!requireAdmin(request, response)) return;
      sendJson(response, 200, { ok: true, cases: repositories.masterCases.listAll() });
      return;
    }

    if (url.pathname === "/api/admin/brains/master-cases" && request.method === "POST") {
      if (!requireAdmin(request, response)) return;
      try {
        const payload = (await readJsonBody(request)) as Record<string, unknown>;
        const masterCase = {
          caseId: (typeof payload.caseId === "string" ? payload.caseId : null) ?? randomUUID(),
          industry: typeof payload.industry === "string" ? payload.industry : "general",
          channel: typeof payload.channel === "string" ? payload.channel : "social",
          summary: typeof payload.summary === "string" ? payload.summary : "",
          brief: typeof payload.brief === "string" ? payload.brief : "",
          whatWorked: typeof payload.whatWorked === "string" ? payload.whatWorked : "",
          whatFailed: typeof payload.whatFailed === "string" ? payload.whatFailed : null,
          takeaway: typeof payload.takeaway === "string" ? payload.takeaway : "",
          tags: Array.isArray(payload.tags) ? payload.tags.filter((t): t is string => typeof t === "string") : [],
          createdAt: new Date().toISOString()
        };
        repositories.masterCases.create(masterCase);
        sendJson(response, 201, { ok: true, caseId: masterCase.caseId });
      } catch (error) {
        sendKnownError(response, error, "新增案例失敗。");
      }
      return;
    }

    if (url.pathname === "/api/admin/brains/brand-brains" && request.method === "GET") {
      if (!requireAdmin(request, response)) return;
      const clients = repositories.clients.list();
      const brandBrainsList = clients
        .map(c => ({ clientId: c.clientId, name: c.name, industry: c.industry, brain: repositories.brandBrains.getByClientId(c.clientId) }))
        .filter(x => x.brain !== null);
      sendJson(response, 200, { ok: true, brandBrains: brandBrainsList });
      return;
    }

    if (url.pathname === "/api/demo/dispatch" && request.method === "POST") {
      if (!requireOperator(request, response) || !requireCostConfirmation(request, response)) {
        return;
      }
      try {
        const payload = await readJsonBody(request);
        const result = await createTaskAndDispatch(repositories, formsAdapter, payload, {
          actorAlias: request.context.actor.alias
        });
        sendJson(response, 201, {
          ok: true,
          ...result,
          contentBody: result.output.contentBody
        });
      } catch (error) {
        sendKnownError(response, error, "Demo dispatch 請求格式錯誤。");
      }
      return;
    }

    if (url.pathname === "/api/demo/compare" && request.method === "POST") {
      if (!requireOperator(request, response) || !requireCostConfirmation(request, response)) {
        return;
      }
      try {
        const payload = (await readJsonBody(request)) as {
          clientIds?: unknown;
          skillId?: unknown;
          title?: unknown;
        };
        const clientIds = Array.isArray(payload.clientIds)
          ? payload.clientIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        if (clientIds.length < 2 || clientIds.length > 3) {
          sendErrorResponse(response, 400, "INVALID_COMPARE_SIZE", "Compare 一次只能選擇 2 到 3 個 client。");
          return;
        }
        const skillId = typeof payload.skillId === "string" ? payload.skillId : "";
        const title = typeof payload.title === "string" ? payload.title : "";
        const settled = await Promise.allSettled(
          clientIds.map(async (clientId) => {
            const client = repositories.clients.getById(clientId);
            if (!client) {
              throw new Error(`Client ${clientId} not found.`);
            }
            const result = await createTaskAndDispatch(
              repositories,
              formsAdapter,
              {
                clientId,
                skillId,
                title,
                type: "content",
                createdBy: "partner"
              },
              {
                actorAlias: request.context.actor.alias
              }
            );
            return {
              clientId,
              clientName: client.name,
              status: "ok" as const,
              taskId: result.taskId,
              taskBrief: result.taskBrief,
              committeeReview: result.committeeReview,
              contentBody: result.output.contentBody,
              costSummary: result.costSummary,
              walletSnapshot: result.walletSnapshot,
              traces: result.traces,
              verdict: result.committeeReview?.verdict ?? result.verdict
            };
          })
        );
        const results = settled.map((entry, index) => {
          const clientId = clientIds[index] ?? "";
          const client = repositories.clients.getById(clientId);
          if (entry.status === "fulfilled") {
            return entry.value;
          }
          const error = buildKnownErrorPayload(entry.reason, "Compare 執行失敗。");
          return {
            clientId,
            clientName: client?.name ?? clientId,
            status: "failed" as const,
            error
          };
        });
        const totalCostUsd = results.reduce((sum, result) => {
          if (result.status !== "ok") {
            return sum;
          }
          return sum + result.costSummary.estimatedUsd;
        }, 0);
        sendJson(response, 201, {
          ok: true,
          results,
          totalCostUsd: Number(totalCostUsd.toFixed(6))
        });
      } catch (error) {
        sendKnownError(response, error, "Compare 請求格式錯誤。");
      }
      return;
    }

    if (url.pathname === "/api/tasks/demo" && request.method === "POST") {
      if (!requireOperator(request, response) || !requireCostConfirmation(request, response)) {
        return;
      }
      try {
        const result = await runDemoTask(repositories, formsAdapter, "client_demo_001", {
          actorAlias: request.context.actor.alias
        });
        sendJson(response, 200, { ok: true, ...result, snapshot: repositories.snapshot() });
      } catch (error) {
        sendKnownError(response, error, "Demo task 執行失敗。");
      }
      return;
    }

    if (url.pathname === "/api/tasks" && request.method === "POST") {
      if (!requireOperator(request, response) || !requireCostConfirmation(request, response)) {
        return;
      }
      try {
        const payload = await readJsonBody(request);
        const result = await createTaskAndDispatch(repositories, formsAdapter, payload, {
          actorAlias: request.context.actor.alias
        });
        sendJson(response, 201, { ok: true, ...result, snapshot: repositories.snapshot() });
      } catch (error) {
        sendKnownError(response, error, "Task 請求格式錯誤。");
      }
      return;
    }

    if (taskApiMatch && request.method === "GET") {
      if (!requireViewer(request, response)) {
        return;
      }
      const taskId = decodeURIComponent(taskApiMatch[1] ?? "");
      const task = repositories.tasks.getById(taskId);
      if (!task) {
        sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定任務。");
        return;
      }
      const client = repositories.clients.getById(task.clientId);
      const output = repositories.outputs.listByClient(task.clientId).find((item) => item.taskId === task.taskId) ?? null;
      const traces = repositories.traces.listByTaskId(task.taskId);
      sendJson(response, 200, { ok: true, client, task, output, traces });
      return;
    }

    if (url.pathname === "/api/tasks") {
      if (!requireViewer(request, response)) {
        return;
      }
      sendJson(response, 200, { ok: true, tasks: repositories.tasks.listAll() });
      return;
    }

    if (outputDetailMatch) {
      if (!requireViewer(request, response)) return;
      const clientId = decodeURIComponent(outputDetailMatch[1] ?? "");
      const outputId = decodeURIComponent(outputDetailMatch[2] ?? "");
      const client = repositories.clients.getById(clientId);
      const output = repositories.outputs.getById(outputId);
      if (!client || !output || output.clientId !== clientId) {
        sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定輸出。");
        return;
      }
      const task = repositories.tasks.getById(output.taskId);
      const traces = repositories.traces.listByTaskId(output.taskId);
      const brandBrain = repositories.brandBrains.getByClientId(clientId);
      sendHtml(response, renderOutputDetailPage(client, brandBrain, output, task, traces));
      return;
    }

    if (clientDetailMatch) {
      if (!requireViewer(request, response)) return;
      const clientId = decodeURIComponent(clientDetailMatch[1] ?? "");
      const client = repositories.clients.getById(clientId);
      if (!client) {
        sendErrorResponse(response, 404, "NOT_FOUND", "找不到指定客戶。");
        return;
      }
      const brandBrain = repositories.brandBrains.getByClientId(clientId);
      const outputs = repositories.outputs.listByClient(clientId);
      const tasks = repositories.tasks.listByClient(clientId);
      sendHtml(response, renderClientDetailPage(client, brandBrain, outputs, tasks));
      return;
    }

    if (url.pathname === "/database") {
      if (!requireViewer(request, response)) return;
      sendHtml(response, renderDatabaseOverview(repositories));
      return;
    }

    if (url.pathname === "/" || url.pathname === "/dashboard" || url.pathname === "/tasks") {
      if (!requireViewer(request, response)) return;
      sendHtml(response, renderDashboard(repositories.snapshot(), repositories.clients.list(), repositories.tasks.listAll()));
      return;
    }

    if (url.pathname.startsWith("/api/prompt-changes/") && request.method === "POST") {
      if (!requireAdmin(request, response)) {
        return;
      }
      sendErrorResponse(response, 404, "NOT_FOUND", "尚未實作 prompt 變更端點。");
      return;
    }

    if (url.pathname.startsWith("/api/admin/") && request.method === "POST") {
      if (!requireAdmin(request, response)) {
        return;
      }
      sendErrorResponse(response, 404, "NOT_FOUND", "尚未實作管理端點。");
      return;
    }

    sendErrorResponse(response, 404, "NOT_FOUND", "找不到對應路由。");
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      console.log(`Status server listening on http://${host}:${resolvedPort}`);
      resolve(server);
    });
  });
}
