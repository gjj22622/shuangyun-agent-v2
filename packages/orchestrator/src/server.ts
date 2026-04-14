/**
 * V2 双云 AI Agent — 精簡版 Server
 *
 * 只有 3 個頁面：/library（腦手資料庫）/ /workflows（工作流）/ /brands（品牌管理）
 * 核心流程：腦討論 → 命令手 → 手產出 → 腦 check → 交付
 */

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Actor } from "@shuangyun/shared-types";
import { attachRequestContext, authenticateRequest, requireAuth, requireCostConfirmation, sendErrorResponse } from "./auth/middleware.js";
import { parsePlatformAccessTokens } from "./auth/token-registry.js";
import { ensureTeamMembersFromTokens } from "./auth/team-members-bootstrap.js";
import { ensureWalletForAllMembers } from "./auth/wallet.js";
import type { GoogleFormsAdapter } from "./integrations/google-forms.js";
import type { RepositoryBundle } from "./repositories/bundle.js";
import { renderPageShell, escapeHtml } from "./web/shared-templates.js";

/* ─── Helpers ─── */

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(json);
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function sendKnownError(res: ServerResponse, error: unknown, fallback: string): void {
  const msg = error instanceof Error ? error.message : fallback;
  sendErrorResponse(res, 400, "INVALID_REQUEST", msg);
}

/* ─── SSR Pages ─── */

function renderLibraryPage(skills: Array<{ skillId: string; name: string; kind: string; category: string; description: string }>): string {
  const brains = skills.filter(s => s.kind === "sub_agent");
  const hands = skills.filter(s => s.kind !== "sub_agent");

  const renderCard = (s: typeof skills[0], icon: string, color: string) =>
    `<div class="surface-2 rounded-xl p-4 hover:shadow-lg transition">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-xl">${icon}</span>
        <span class="font-bold text-sm text-primary">${escapeHtml(s.name)}</span>
      </div>
      <div class="text-[10px] text-muted mb-2">${escapeHtml(s.category)} · ${escapeHtml(s.kind)}</div>
      <p class="text-xs text-secondary leading-relaxed">${escapeHtml((s.description || "").slice(0, 100))}</p>
    </div>`;

  const body = `
  <div class="flex items-center justify-between mb-6">
    <div>
      <h2 class="text-2xl font-bold text-primary">腦手資料庫</h2>
      <p class="text-xs text-muted mt-1">${brains.length} 個腦 · ${hands.length} 個手</p>
    </div>
    <button class="btn-primary px-5 py-2.5 rounded-lg text-sm font-bold" onclick="document.getElementById('upload-modal').classList.remove('hidden')">+ 上傳 Skill</button>
  </div>

  <h3 class="text-sm font-bold text-primary uppercase tracking-wider mb-3">🧠 腦（${brains.length}）</h3>
  <div class="grid grid-cols-3 gap-4 mb-8">
    ${brains.map(s => renderCard(s, "🧠", "sky")).join("") || '<div class="col-span-3 text-center text-muted py-4">無腦 Skill</div>'}
  </div>

  <h3 class="text-sm font-bold text-primary uppercase tracking-wider mb-3">✋ 手（${hands.length}）</h3>
  <div class="grid grid-cols-3 gap-4">
    ${hands.map(s => renderCard(s, "✋", "emerald")).join("") || '<div class="col-span-3 text-center text-muted py-4">無手 Skill</div>'}
  </div>

  <!-- 上傳 Modal -->
  <div id="upload-modal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick="if(event.target===this)this.classList.add('hidden')">
    <div class="surface-2 rounded-2xl p-6 w-full max-w-lg">
      <h3 class="text-lg font-bold text-primary mb-3">上傳 Skill (.md)</h3>
      <textarea id="skill-content" class="input-field w-full rounded-lg p-3 text-xs" rows="12" placeholder="貼上 SKILL.md 內容..."></textarea>
      <div class="flex justify-end gap-2 mt-3">
        <button class="surface-1 px-4 py-2 rounded-lg text-xs font-semibold" onclick="this.closest('#upload-modal').classList.add('hidden')">取消</button>
        <button class="btn-primary px-4 py-2 rounded-lg text-xs font-bold" onclick="uploadSkill()">上傳</button>
      </div>
      <div id="upload-result" class="text-xs mt-2 hidden"></div>
    </div>
  </div>

  <script>
    async function uploadSkill() {
      const content = document.getElementById("skill-content").value;
      const result = document.getElementById("upload-result");
      try {
        const res = await fetch("/api/library/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content })
        });
        if (!res.ok) throw new Error("上傳失敗");
        result.className = "text-xs mt-2 text-emerald-600";
        result.textContent = "上傳成功！重新整理即可看到。";
      } catch (e) {
        result.className = "text-xs mt-2 text-red-600";
        result.textContent = e.message;
      }
      result.classList.remove("hidden");
    }
  </script>`;

  return renderPageShell({ title: "腦手資料庫 · 双云 AI Agent V2", active: "dashboard", subtitle: "腦手資料庫", body });
}

function renderBrandsPage(clients: Array<{ clientId: string; name: string; industry: string; createdAt: string }>): string {
  const rows = clients.map(c =>
    `<tr class="hover:bg-slate-50 dark:hover:bg-white/[.03]">
      <td class="px-4 py-3 font-bold text-primary">${escapeHtml(c.name)}</td>
      <td class="px-4 py-3 text-xs text-muted">${escapeHtml(c.industry)}</td>
      <td class="px-4 py-3 text-xs text-muted">${escapeHtml(c.createdAt.slice(0, 10))}</td>
      <td class="px-4 py-3 text-xs"><a href="/brands/${escapeHtml(c.clientId)}" class="text-sky-600 hover:underline">管理</a></td>
    </tr>`
  ).join("");

  const body = `
  <div class="flex items-center justify-between mb-6">
    <div>
      <h2 class="text-2xl font-bold text-primary">品牌管理</h2>
      <p class="text-xs text-muted mt-1">${clients.length} 個品牌</p>
    </div>
    <a href="/brands/new" class="btn-primary px-5 py-2.5 rounded-lg text-sm font-bold">+ 新增品牌</a>
  </div>
  <section class="surface-2 rounded-2xl overflow-hidden">
    <table class="w-full text-sm">
      <thead class="text-xs text-muted uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
        <tr><th class="text-left px-4 py-3">品牌</th><th class="text-left px-4 py-3">產業</th><th class="text-left px-4 py-3">建立日期</th><th class="px-4 py-3"></th></tr>
      </thead>
      <tbody class="divide-y divide-slate-200 dark:divide-slate-800/60">
        ${rows || '<tr><td colspan="4" class="text-center py-8 text-muted">尚無品牌</td></tr>'}
      </tbody>
    </table>
  </section>`;

  return renderPageShell({ title: "品牌管理 · 双云 AI Agent V2", active: "dashboard", subtitle: "品牌管理", body });
}

function renderWorkflowsPage(workflows: Array<{ workflowId: string; name: string; clientId: string; nodeCount: number; version: number }>): string {
  const rows = workflows.map(w =>
    `<tr class="hover:bg-slate-50 dark:hover:bg-white/[.03]">
      <td class="px-4 py-3"><a href="/workflows/${escapeHtml(w.workflowId)}" class="font-bold text-sky-600 hover:underline">${escapeHtml(w.name)}</a></td>
      <td class="px-4 py-3 text-xs text-center">${w.nodeCount}</td>
      <td class="px-4 py-3 text-xs">v${w.version}</td>
    </tr>`
  ).join("");

  const body = `
  <div class="flex items-center justify-between mb-6">
    <div>
      <h2 class="text-2xl font-bold text-primary">工作流</h2>
      <p class="text-xs text-muted mt-1">腦討論 → 手執行 → 腦 check → 交付</p>
    </div>
    <a href="/workflows/new" class="btn-primary px-5 py-2.5 rounded-lg text-sm font-bold">+ 新增工作流</a>
  </div>
  <section class="surface-2 rounded-2xl overflow-hidden">
    <table class="w-full text-sm">
      <thead class="text-xs text-muted uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
        <tr><th class="text-left px-4 py-3">名稱</th><th class="text-center px-4 py-3">節點</th><th class="text-left px-4 py-3">版本</th></tr>
      </thead>
      <tbody class="divide-y divide-slate-200 dark:divide-slate-800/60">
        ${rows || '<tr><td colspan="3" class="text-center py-8 text-muted">尚無工作流</td></tr>'}
      </tbody>
    </table>
  </section>`;

  return renderPageShell({ title: "工作流 · 双云 AI Agent V2", active: "dashboard", subtitle: "工作流", body });
}

/* ─── Server ─── */

export function startStatusServer(host: string, port: number, repositories: RepositoryBundle, _formsAdapter: GoogleFormsAdapter): Promise<Server> {
  import("./connectors/index.js").then(m => m.initConnectors()).catch(e => console.error("[connectors]", e));

  const tokenRegistry = parsePlatformAccessTokens(process.env.PLATFORM_ACCESS_TOKENS);
  const bootstrap = ensureTeamMembersFromTokens(tokenRegistry, repositories.teamMembers);
  console.log(`ensured ${bootstrap.ensured} team members`);
  const walletBootstrap = ensureWalletForAllMembers(repositories);
  console.log(`ensured ${walletBootstrap.ensured} wallets (Bronze ${walletBootstrap.tierCounts.Bronze}, Silver ${walletBootstrap.tierCounts.Silver}, Gold ${walletBootstrap.tierCounts.Gold}, Platinum ${walletBootstrap.tierCounts.Platinum})`);

  const requireViewer = requireAuth(tokenRegistry, "viewer");
  const requireOperator = requireAuth(tokenRegistry, "operator");
  const requireAdmin = requireAuth(tokenRegistry, "admin");

  function parseSessionCookieToken(req: IncomingMessage): string | null {
    const cookie = req.headers.cookie;
    if (!cookie) return null;
    const match = cookie.match(/sy_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]!) : null;
  }

  function isProtectedPage(pathname: string): boolean {
    return pathname === "/" || pathname === "/library" || pathname === "/workflows" || pathname === "/brands" || pathname.startsWith("/workflows/") || pathname.startsWith("/brands/");
  }

  const server = createServer(async (request, response) => {
    attachRequestContext(request);
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

    // Health
    if (url.pathname === "/health") {
      sendJson(response, 200, { status: "ok", appEnv: process.env.APP_ENV ?? "development", uptimeSeconds: Math.floor(process.uptime()) });
      return;
    }

    // Login page
    if (url.pathname === "/login" && request.method === "GET") {
      sendHtml(response, renderPageShell({
        title: "登入 · 双云 AI Agent V2", active: "dashboard", subtitle: "登入",
        body: `<div class="max-w-sm mx-auto mt-20"><h2 class="text-xl font-bold text-primary mb-4 text-center">登入</h2>
        <form method="POST" action="/api/login" onsubmit="event.preventDefault();fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:document.getElementById('token').value})}).then(r=>r.json()).then(d=>{if(d.alias){document.cookie='sy_token='+document.getElementById('token').value+';path=/';location.href='/'}else{alert('Token 無效')}})">
        <input id="token" type="password" class="input-field w-full rounded-lg px-3 py-3 text-sm mb-3" placeholder="輸入 Token" />
        <button class="btn-primary w-full py-3 rounded-lg text-sm font-bold">登入</button></form></div>`
      }));
      return;
    }

    // Login API
    if (url.pathname === "/api/login" && request.method === "POST") {
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const token = typeof body.token === "string" ? body.token : "";
      const actor = authenticateRequest({ ...request, headers: { ...request.headers, authorization: `Bearer ${token}` } } as IncomingMessage, tokenRegistry);
      if (actor) { sendJson(response, 200, { alias: actor.alias, role: actor.role }); }
      else { sendErrorResponse(response, 401, "INVALID_TOKEN", "Token 無效"); }
      return;
    }

    // Auth guard for pages
    if (isProtectedPage(url.pathname)) {
      const cookieToken = parseSessionCookieToken(request);
      if (cookieToken) {
        authenticateRequest({ ...request, headers: { ...request.headers, authorization: `Bearer ${cookieToken}` } } as IncomingMessage, tokenRegistry);
      }
      const actor = (request as IncomingMessage & { context?: { actor: Actor | null } }).context?.actor;
      if (!actor) { response.writeHead(302, { Location: "/login" }); response.end(); return; }
    }

    // ===== SSR Pages =====

    if (url.pathname === "/" || url.pathname === "/library") {
      const skills = repositories.skills.list().map(s => ({ skillId: s.skillId, name: s.name, kind: s.kind, category: s.category, description: s.description }));
      sendHtml(response, renderLibraryPage(skills));
      return;
    }

    if (url.pathname === "/brands") {
      const clients = repositories.clients.list().map(c => ({ clientId: c.clientId, name: c.name, industry: c.industry, createdAt: c.createdAt }));
      sendHtml(response, renderBrandsPage(clients));
      return;
    }

    if (url.pathname === "/workflows") {
      const wfs = repositories.workflows.list().map(w => ({ workflowId: w.workflowId, name: w.name, clientId: w.clientId, nodeCount: w.nodes.length, version: w.version }));
      sendHtml(response, renderWorkflowsPage(wfs));
      return;
    }

    // ===== API =====

    // Library: list
    if (url.pathname === "/api/library" && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      sendJson(response, 200, { ok: true, skills: repositories.skills.list() });
      return;
    }

    // Library: upload skill md
    if (url.pathname === "/api/library/upload" && request.method === "POST") {
      if (!requireOperator(request, response)) return;
      try {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const content = typeof body.content === "string" ? body.content : "";
        if (!content.trim()) { sendErrorResponse(response, 400, "EMPTY", "內容不能為空"); return; }
        // 簡易解析 frontmatter name
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const skillId = nameMatch ? nameMatch[1]!.trim() : randomUUID();
        // 存入 skills（簡化版，用第一個 block）
        const layerMatch = content.match(/^layer:\s*(.+)$/m);
        const kind = layerMatch && layerMatch[1]!.trim() === "brain" ? "sub_agent" as const : "workflow" as const;
        repositories.skills.save({
          skillId, name: skillId, kind, category: "content_writing", version: "1.0",
          description: content.slice(0, 200), inputSchema: {}, outputSchema: {},
          blocks: [{ blockId: "main", name: skillId, type: "skill", systemPrompt: content }],
          isShared: true
        });
        sendJson(response, 201, { ok: true, skillId });
      } catch (error) { sendKnownError(response, error, "上傳失敗"); }
      return;
    }

    // Brands: list
    if (url.pathname === "/api/brands" && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      sendJson(response, 200, { ok: true, clients: repositories.clients.list() });
      return;
    }

    // Workflows: CRUD
    if (url.pathname === "/api/workflows" && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      sendJson(response, 200, { ok: true, workflows: repositories.workflows.list() });
      return;
    }

    if (url.pathname === "/api/workflows" && request.method === "POST") {
      if (!requireOperator(request, response)) return;
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const workflowId = randomUUID();
      const now = new Date().toISOString();
      repositories.workflows.create({
        workflowId,
        name: typeof body.name === "string" ? body.name : "未命名",
        clientId: typeof body.clientId === "string" ? body.clientId : "",
        nodes: Array.isArray(body.nodes) ? body.nodes as any[] : [],
        edges: Array.isArray(body.edges) ? body.edges as any[] : [],
        createdBy: request.context.actor.alias, version: 1, createdAt: now, updatedAt: now
      });
      sendJson(response, 201, { ok: true, workflowId });
      return;
    }

    // Workflows: run
    const wfRunMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/run$/);
    if (wfRunMatch && request.method === "POST") {
      if (!requireOperator(request, response) || !requireCostConfirmation(request, response)) return;
      const wf = repositories.workflows.getById(wfRunMatch[1]!);
      if (!wf) { sendErrorResponse(response, 404, "NOT_FOUND", "找不到工作流"); return; }
      try {
        const { executeWorkflow } = await import("./runtime/workflow-engine.js");
        const result = await executeWorkflow(wf, repositories);
        sendJson(response, 200, { ok: true, ...result });
      } catch (error) { sendKnownError(response, error, "工作流執行失敗"); }
      return;
    }

    // Connectors
    if (url.pathname === "/api/connectors" && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      import("./connectors/index.js").then(m => {
        sendJson(response, 200, { ok: true, connectors: m.listConnectors().map(c => ({ id: c.id, name: c.name, category: c.category, available: c.isAvailable() })) });
      }).catch(() => sendJson(response, 200, { ok: true, connectors: [] }));
      return;
    }

    // 404
    sendErrorResponse(response, 404, "NOT_FOUND", `找不到 ${url.pathname}`);
  });

  return new Promise(resolve => {
    server.listen(Number(port), host, () => {
      console.log(`Status server listening on http://${host}:${port}`);
      resolve(server);
    });
  });
}
