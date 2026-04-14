/**
 * 任務中心 與 Brand Comparison 的 SSR templates。
 * 視覺基礎來自 04_MVP規劃/previews/demo-console.html 與 brand-compare.html，
 * 透過 shared-templates.ts 共用淺色 / 深色主題切換與 header、nav。
 */

import type { TodayCostSnapshot } from "../auth/cost-ledger.js";
import { escapeHtml, renderPageShell, serializeJson } from "./shared-templates.js";

export type DemoCatalogClient = {
  clientId: string;
  name: string;
  industry: string;
};

export type DemoCatalogSkill = {
  skillId: string;
  name: string;
  category: string;
};

export type DemoConsolePageInput = {
  viewerAlias: string;
  catalog: {
    clients: DemoCatalogClient[];
    skills: DemoCatalogSkill[];
  };
  costSnapshot: TodayCostSnapshot;
};

export type DemoComparePageInput = DemoConsolePageInput;

function renderClientSelect(clients: DemoCatalogClient[], id: string): string {
  const options = clients
    .map((client) => `<option value="${escapeHtml(client.clientId)}">${escapeHtml(client.name)} · ${escapeHtml(client.industry)}</option>`)
    .join("");
  return `<select id="${id}" name="clientId" class="input-field w-full rounded-lg px-3 py-2.5 text-sm"><option value="">請選擇客戶</option>${options}</select>`;
}

function renderSkillSelect(skills: DemoCatalogSkill[], id: string): string {
  const options = skills
    .map((skill) => `<option value="${escapeHtml(skill.skillId)}">${escapeHtml(skill.name)}</option>`)
    .join("");
  return `<select id="${id}" name="skillId" class="input-field w-full rounded-lg px-3 py-2.5 text-sm"><option value="">請選擇 Skill</option>${options}</select>`;
}

function renderCostCard(snapshot: TodayCostSnapshot): string {
  const usedPct = snapshot.budgetUsd > 0 ? Math.min(100, Math.round((snapshot.todayUsd / snapshot.budgetUsd) * 100)) : 0;
  return `<section class="zone-token rounded-xl p-4 flex items-center justify-between">
  <div class="flex items-center gap-3">
    <div class="text-3xl">💰</div>
    <div>
      <div class="font-bold text-primary">今日團隊共用成本</div>
      <div class="text-xs text-secondary" data-cost-date>${escapeHtml(snapshot.date)}</div>
    </div>
  </div>
  <div class="text-right">
    <div class="text-xs text-secondary uppercase font-semibold">已用 / 預算</div>
    <div class="text-xl font-bold text-amber-600 dark:text-amber-300">
      <span data-cost-today>${snapshot.todayUsd.toFixed(2)}</span> / <span data-cost-budget>${snapshot.budgetUsd.toFixed(2)}</span> USD
    </div>
    <div class="progress-bar mt-1" style="width:180px;"><span class="bar-yellow" data-cost-bar style="width:${usedPct}%"></span></div>
  </div>
</section>`;
}

export function renderDemoConsole(input: DemoConsolePageInput): string {
  const clientSelect = renderClientSelect(input.catalog.clients, "demo-client");
  const skillSelect = renderSkillSelect(input.catalog.skills, "demo-skill");
  const initialCatalog = serializeJson(input.catalog);
  const initialSnapshot = serializeJson(input.costSnapshot);
  const defaultClientId = input.catalog.clients[0]?.clientId ?? "";
  const defaultSkillId = input.catalog.skills[0]?.skillId ?? "";

  const body = `
  ${renderCostCard(input.costSnapshot)}

  <div class="grid grid-cols-12 gap-6">

    <section class="col-span-5 space-y-4">
      <div class="zone-merged rounded-2xl p-6">
        <div class="text-center mb-5">
          <div class="text-5xl pulse-slow">🧠</div>
          <h2 class="text-xl font-bold text-primary mt-2">觸發三腦協作</h2>
          <p class="text-xs text-muted mt-1">Viewer: ${escapeHtml(input.viewerAlias)}</p>
        </div>
        <form id="demo-form" class="space-y-4">
          <div>
            <label class="block text-xs text-secondary mb-1.5 uppercase tracking-wider font-semibold">客戶品牌</label>
            ${clientSelect}
          </div>
          <div>
            <label class="block text-xs text-secondary mb-1.5 uppercase tracking-wider font-semibold">執行 Skill</label>
            ${skillSelect}
          </div>
          <div>
            <label class="block text-xs text-secondary mb-1.5 uppercase tracking-wider font-semibold">任務標題</label>
            <input id="demo-title" name="title" type="text" class="input-field w-full rounded-lg px-3 py-2.5 text-sm" placeholder="例：四月 IG 貼文 · 熟客回診">
          </div>
          <div>
            <label class="block text-xs text-secondary mb-1.5 uppercase tracking-wider font-semibold">任務類型</label>
            <select id="demo-type" name="type" class="input-field w-full rounded-lg px-3 py-2.5 text-sm">
              <option value="content">content · 內容</option>
              <option value="image">image · 圖像</option>
              <option value="video">video · 影片</option>
              <option value="plan">plan · 企劃</option>
              <option value="ads">ads · 廣告</option>
              <option value="report">report · 報告</option>
            </select>
          </div>
          <!-- 模式切換 -->
          <div class="flex gap-2" id="mode-toggle">
            <button type="button" data-mode="consultation" class="flex-1 py-2.5 rounded-lg text-xs font-bold border-2 border-sky-500 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 transition" onclick="setMode('consultation')">💡 只問腦</button>
            <button type="button" data-mode="full_dispatch" class="flex-1 py-2.5 rounded-lg text-xs font-bold border-2 border-transparent bg-slate-100 dark:bg-slate-800 text-secondary transition" onclick="setMode('full_dispatch')">✋ 腦 + 手</button>
          </div>
          <!-- Review 可選開關 + 花費標示 -->
          <div class="flex items-center justify-between mt-2 mb-2">
            <label class="flex items-center gap-2 text-xs text-secondary cursor-pointer">
              <input type="checkbox" id="enable-review" class="rounded" />
              AI 品質審核
              <span class="text-[10px] text-muted">+~$0.005</span>
            </label>
            <span id="cost-estimate" class="text-[10px] text-muted">預估 ~$0.005</span>
          </div>
          <button type="submit" id="demo-submit" class="btn-primary w-full py-3 rounded-lg text-sm font-bold transition">
            開始三腦會議
          </button>
        </form>
        <div id="demo-error" class="mt-3 text-xs text-red-600 dark:text-red-300 hidden"></div>
      </div>
    </section>

    <section class="col-span-7 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-sm uppercase tracking-widest text-secondary font-semibold">三腦協作實況</h3>
        <div id="demo-status" class="text-xs text-muted">等待觸發</div>
      </div>

      <!-- Meeting Room UI（三腦會議可視化） -->
      <div id="meeting-room" class="hidden zone-merged rounded-2xl p-5 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-primary">三腦會議室</h3>
          <div id="meeting-phase" class="text-xs text-muted">準備中</div>
        </div>
        <!-- 3 個角色卡片 -->
        <div class="grid grid-cols-3 gap-3">
          <div id="brain-strategy" class="surface-1 rounded-xl p-3 text-center transition-all duration-300">
            <div class="text-3xl">🧠</div>
            <div class="text-xs font-bold text-primary mt-1">双云策略腦</div>
            <div id="brain-strategy-status" class="text-[10px] text-muted mt-1">等待中</div>
          </div>
          <div id="brain-master" class="surface-1 rounded-xl p-3 text-center transition-all duration-300">
            <div class="text-3xl">🎓</div>
            <div class="text-xs font-bold text-primary mt-1">師傅腦</div>
            <div id="brain-master-status" class="text-[10px] text-muted mt-1">等待中</div>
          </div>
          <div id="brain-brand" class="surface-1 rounded-xl p-3 text-center transition-all duration-300">
            <div class="text-3xl">🏷️</div>
            <div class="text-xs font-bold text-primary mt-1">品牌腦</div>
            <div id="brain-brand-status" class="text-[10px] text-muted mt-1">等待中</div>
          </div>
        </div>
        <!-- 進度條 -->
        <div class="flex gap-1 h-2">
          <div id="phase-1-bar" class="flex-1 rounded-full bg-slate-200 dark:bg-slate-700 transition-all duration-500"></div>
          <div id="phase-2-bar" class="flex-1 rounded-full bg-slate-200 dark:bg-slate-700 transition-all duration-500"></div>
          <div id="phase-3-bar" class="flex-1 rounded-full bg-slate-200 dark:bg-slate-700 transition-all duration-500"></div>
        </div>
        <div class="flex justify-between text-[10px] text-muted">
          <span>Phase 1 開場</span><span>Phase 2 交叉</span><span>Phase 3 彙整</span>
        </div>
        <!-- 對話流 -->
        <div id="meeting-messages" class="space-y-2 max-h-[400px] overflow-y-auto"></div>
        <!-- 報告卡（會議結束後顯示） -->
        <div id="meeting-report" class="hidden space-y-3">
          <div class="text-xs text-secondary uppercase font-semibold">會議報告</div>
          <div id="report-consensus" class="surface-1 rounded-lg p-3"><div class="text-xs font-bold text-emerald-600 dark:text-emerald-300 mb-1">✅ 共識</div><div class="text-xs text-secondary" id="consensus-content"></div></div>
          <div id="report-divergence" class="surface-1 rounded-lg p-3"><div class="text-xs font-bold text-amber-600 dark:text-amber-300 mb-1">⚠️ 分歧</div><div class="text-xs text-secondary" id="divergence-content"></div></div>
          <div id="report-actions" class="surface-1 rounded-lg p-3"><div class="text-xs font-bold text-sky-600 dark:text-sky-300 mb-1">🎯 行動建議</div><div class="text-xs text-secondary" id="actions-content"></div></div>
        </div>
      </div>

      <div id="trace-list" class="space-y-3 min-h-[120px]">
        <div class="surface-1 rounded-xl p-6 text-center text-muted text-sm">
          送出後會依序揭露三腦討論過程與 trace
        </div>
      </div>

      <div id="taskbrief-section" class="hidden zone-merged rounded-2xl p-5">
        <div class="text-xs text-secondary uppercase font-semibold mb-2">TaskBrief</div>
        <div id="taskbrief-angle" class="text-lg font-semibold text-primary mb-3"></div>
        <div class="mb-3">
          <div class="text-xs text-red-600 dark:text-red-300 font-semibold mb-1">Key Messages</div>
          <div id="taskbrief-keymsgs" class="flex flex-wrap gap-1"></div>
        </div>
        <div class="mb-3">
          <div class="text-xs text-rose-600 dark:text-rose-300 font-semibold mb-1">Avoid List</div>
          <div id="taskbrief-avoid" class="flex flex-wrap gap-1"></div>
        </div>
      </div>

      <div id="committee-section" class="hidden zone-brand rounded-2xl p-5">
        <div class="text-xs text-secondary uppercase font-semibold mb-3">4 Agent Committee 評分</div>
        <div id="committee-grid" class="grid grid-cols-4 gap-2 text-xs"></div>
        <div id="committee-verdict" class="mt-3 text-xs text-center"></div>
      </div>

      <div id="draft-section" class="hidden surface-2 rounded-xl p-5">
        <div class="text-xs text-secondary uppercase font-semibold mb-3">內容初稿</div>
        <pre id="draft-output" class="text-sm text-primary whitespace-pre-wrap leading-relaxed font-sans"></pre>
      </div>
    </section>
  </div>

  <script>
    let currentMode = "consultation";
    function setMode(mode) {
      currentMode = mode;
      document.querySelectorAll("#mode-toggle button").forEach(btn => {
        const isActive = btn.dataset.mode === mode;
        btn.className = "flex-1 py-2.5 rounded-lg text-xs font-bold border-2 transition " +
          (isActive ? (mode === "consultation" ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300" : "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300") : "border-transparent bg-slate-100 dark:bg-slate-800 text-secondary");
      });
      submitBtn.textContent = mode === "consultation" ? "💡 指令組裝（免費）" : "✋ 執行任務";
      updateCostEstimate();
    }

    // 花費標示
    const reviewCheckbox = document.getElementById("enable-review");
    const costEstEl = document.getElementById("cost-estimate");
    function updateCostEstimate() {
      const hasReview = reviewCheckbox?.checked;
      if (currentMode === "consultation") {
        costEstEl.textContent = "免費（指令組裝）";
      } else {
        costEstEl.textContent = hasReview ? "預估 ~$0.01（2 次 AI）" : "預估 ~$0.005（1 次 AI）";
      }
    }
    reviewCheckbox?.addEventListener("change", updateCostEstimate);
    updateCostEstimate();

    // Meeting Room UI 控制
    const meetingRoom = document.getElementById("meeting-room");
    const meetingMessages = document.getElementById("meeting-messages");
    const meetingPhase = document.getElementById("meeting-phase");
    const meetingReport = document.getElementById("meeting-report");

    const roleIcons = { strategy: "🧠", master: "🎓", brand: "🏷️" };
    const roleNames = { strategy: "双云策略腦", master: "師傅腦", brand: "品牌腦" };
    const phaseLabels = { opening: "Phase 1 開場", discussion: "Phase 2 交叉", synthesis: "Phase 3 彙整" };

    function highlightBrain(role) {
      ["strategy", "master", "brand"].forEach(r => {
        const el = document.getElementById("brain-" + r);
        const st = document.getElementById("brain-" + r + "-status");
        if (r === role) {
          el.style.borderColor = "var(--accent-c)";
          el.style.boxShadow = "0 0 20px rgba(239,68,68,0.2)";
          st.textContent = "發言中...";
        } else {
          el.style.borderColor = "";
          el.style.boxShadow = "";
          st.textContent = "等待中";
        }
      });
    }

    function updatePhaseBar(phase) {
      const phaseMap = { opening: 1, discussion: 2, synthesis: 3 };
      const num = phaseMap[phase] || 0;
      [1,2,3].forEach(i => {
        const bar = document.getElementById("phase-" + i + "-bar");
        bar.style.background = i <= num ? "linear-gradient(90deg, #dc2626, #f59e0b)" : "";
      });
      meetingPhase.textContent = phaseLabels[phase] || phase;
    }

    function appendMeetingMessage(data) {
      const msg = document.createElement("div");
      msg.className = "flex gap-2 items-start fade-in";
      msg.innerHTML = '<div class="text-xl mt-0.5">' + (roleIcons[data.role] || "💬") + '</div>' +
        '<div class="flex-1 surface-1 rounded-lg p-2.5 text-xs text-secondary leading-relaxed">' +
        '<div class="font-bold text-primary text-[11px] mb-1">' + escapeHtmlClient(roleNames[data.role] || data.role) +
        ' <span class="text-muted font-normal">' + escapeHtmlClient(phaseLabels[data.phase] || "") + '</span></div>' +
        escapeHtmlClient(data.content || "") + '</div>';
      meetingMessages.appendChild(msg);
      meetingMessages.scrollTop = meetingMessages.scrollHeight;
    }

    function showMeetingReport(report) {
      meetingReport.classList.remove("hidden");
      document.getElementById("consensus-content").textContent = (report.consensus || []).join("\\n");
      document.getElementById("divergence-content").textContent = (report.divergence || []).join("\\n");
      document.getElementById("actions-content").textContent = (report.actionItems || []).join("\\n");
    }

    async function runBrainMeeting(clientId, skillId, title) {
      meetingRoom.classList.remove("hidden");
      meetingMessages.innerHTML = "";
      meetingReport.classList.add("hidden");
      meetingPhase.textContent = "啟動中...";

      try {
        const startRes = await fetch("/api/brain-meeting/start", {
          method: "POST",
          headers: { "content-type": "application/json", "x-confirm-cost": "true" },
          body: JSON.stringify({ clientId, skillId, title, mode: currentMode })
        });
        const startBody = await startRes.json();
        if (!startRes.ok) throw new Error(startBody?.error?.message || "啟動失敗");

        const meetingId = startBody.meetingId;
        meetingPhase.textContent = "連接中...";

        const eventSource = new EventSource("/api/brain-meeting/" + meetingId + "/stream");
        eventSource.onmessage = function(event) {
          const data = JSON.parse(event.data);
          if (data.type === "done") {
            eventSource.close();
            meetingPhase.textContent = "會議結束";
            highlightBrain("");
            // 取得報告
            fetch("/api/brain-meeting/" + meetingId + "/report")
              .then(r => r.json())
              .then(r => { if (r.report) showMeetingReport(r.report); })
              .catch(() => {});
            // 腦+手模式：自動接 dispatch
            if (currentMode === "full_dispatch") {
              statusLabel.textContent = "腦會議結束，接著執行 dispatch...";
              submitBtn.click();
            }
            return;
          }
          highlightBrain(data.role || "");
          updatePhaseBar(data.phase || "");
          appendMeetingMessage(data);
        };
        eventSource.onerror = function() {
          eventSource.close();
          meetingPhase.textContent = "連線中斷";
        };
      } catch (err) {
        meetingPhase.textContent = "失敗：" + (err.message || "");
        showError(err.message || "三腦會議啟動失敗");
      }
    }

    const initialCatalog = ${initialCatalog};
    const initialSnapshot = ${initialSnapshot};
    const form = document.getElementById("demo-form");
    const clientSelect = document.getElementById("demo-client");
    const skillSelect = document.getElementById("demo-skill");
    const titleInput = document.getElementById("demo-title");
    const typeSelect = document.getElementById("demo-type");
    const submitBtn = document.getElementById("demo-submit");
    const errorPanel = document.getElementById("demo-error");
    const statusLabel = document.getElementById("demo-status");
    const traceList = document.getElementById("trace-list");
    const briefSection = document.getElementById("taskbrief-section");
    const briefAngle = document.getElementById("taskbrief-angle");
    const briefKeyMsgs = document.getElementById("taskbrief-keymsgs");
    const briefAvoid = document.getElementById("taskbrief-avoid");
    const committeeSection = document.getElementById("committee-section");
    const committeeGrid = document.getElementById("committee-grid");
    const committeeVerdict = document.getElementById("committee-verdict");
    const draftSection = document.getElementById("draft-section");
    const draftOutput = document.getElementById("draft-output");

    if (${JSON.stringify(defaultClientId)}) clientSelect.value = ${JSON.stringify(defaultClientId)};
    if (${JSON.stringify(defaultSkillId)}) skillSelect.value = ${JSON.stringify(defaultSkillId)};

    function escapeHtmlClient(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

    function mapErrorCode(code, fallback) {
      const t = {
        INVALID_TOKEN: "登入狀態已過期，請重新登入",
        DAILY_BUDGET_EXCEEDED: "今日團隊預算已用盡",
        MEMBER_QUOTA_EXCEEDED: "你的個人配額已用盡",
        INSUFFICIENT_TOKEN_BALANCE: "錢包餘額不足，聯絡 Jacky 補 token",
        TIER_DAILY_CAP_EXCEEDED: "今日 tier 上限已達",
        MEMBER_ARCHIVED: "帳號已停用",
        COST_CONFIRMATION_REQUIRED: "缺少成本確認 header（系統錯誤）",
        INVALID_REQUEST: "請檢查欄位是否完整"
      };
      return t[code] || fallback || "發生未預期錯誤";
    }

    function showError(msg) {
      errorPanel.textContent = msg;
      errorPanel.classList.remove("hidden");
    }
    function clearError() { errorPanel.classList.add("hidden"); }

    function zoneClassForPhase(phase) {
      if (phase === "brain_select") return "zone-shuangyun";
      if (phase === "master_recall") return "zone-master";
      if (phase === "brain_briefing") return "zone-merged";
      if (phase === "skill_run") return "zone-hands";
      if (phase === "committee_review") return "zone-brand";
      if (phase === "form_write") return "zone-db";
      return "surface-1";
    }

    function iconForPhase(phase) {
      if (phase === "brain_select") return "🧠";
      if (phase === "master_recall") return "🎓";
      if (phase === "brain_briefing") return "💡";
      if (phase === "skill_run") return "✋";
      if (phase === "committee_review") return "⚖️";
      if (phase === "form_write") return "🗄️";
      return "📍";
    }

    function renderTraces(traces) {
      traceList.innerHTML = "";
      traces.forEach((trace, idx) => {
        setTimeout(() => {
          const card = document.createElement("article");
          card.className = "fade-in rounded-xl p-4 flex gap-4 " + zoneClassForPhase(trace.phase);
          card.innerHTML =
            '<div class="text-3xl">' + iconForPhase(trace.phase) + '</div>' +
            '<div class="flex-1">' +
            '<div class="flex items-center justify-between">' +
            '<div class="text-sm font-bold text-primary">' + escapeHtmlClient(trace.stepName) + '</div>' +
            '<div class="text-xs text-muted mono">' + escapeHtmlClient(trace.phase) + '</div>' +
            '</div>' +
            '<div class="text-xs text-secondary mt-1">' + escapeHtmlClient(trace.outputSummary || trace.inputSummary || "") + '</div>' +
            (trace.errorCode ? '<div class="text-xs text-red-600 dark:text-red-300 mt-1">error: ' + escapeHtmlClient(trace.errorCode) + '</div>' : '') +
            '</div>';
          traceList.appendChild(card);
        }, idx * 300);
      });
    }

    function renderTaskBrief(brief) {
      if (!brief) { briefSection.classList.add("hidden"); return; }
      briefSection.classList.remove("hidden");
      briefAngle.textContent = brief.angle || "";
      briefKeyMsgs.innerHTML = (brief.keyMessages || []).map(m =>
        '<span class="px-2 py-0.5 bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/35 rounded text-red-700 dark:text-red-200 text-xs">' + escapeHtmlClient(m) + '</span>'
      ).join("");
      briefAvoid.innerHTML = (brief.avoidList || []).map(a =>
        '<span class="px-2 py-0.5 bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 rounded text-rose-700 dark:text-rose-200 text-xs">' + escapeHtmlClient(a) + '</span>'
      ).join("");
    }

    function renderCommittee(review) {
      if (!review) { committeeSection.classList.add("hidden"); return; }
      committeeSection.classList.remove("hidden");
      const roles = [["👑 老闆","bossScore","bossNote"],["🧑‍💼 主管","managerScore","managerNote"],["📞 窗口","windowScore","windowNote"],["🎨 品牌","brandScore","brandNote"]];
      committeeGrid.innerHTML = roles.map(r =>
        '<div class="surface-sunken rounded p-2 text-center">' +
        '<div class="text-[10px] text-muted">' + r[0] + '</div>' +
        '<div class="font-bold text-amber-700 dark:text-amber-300 text-lg">' + escapeHtmlClient(review[r[1]]) + '/10</div>' +
        '<div class="text-[10px] text-muted">' + escapeHtmlClient(review[r[2]] || "") + '</div>' +
        '</div>'
      ).join("");
      committeeVerdict.innerHTML = '<span class="verdict-pill verdict-' + escapeHtmlClient(review.verdict) + '">' + escapeHtmlClient(review.verdict) + '</span> confidence ' + escapeHtmlClient(review.confidence);
    }

    async function refreshCostSnapshot() {
      try {
        const res = await fetch("/api/demo/cost-snapshot");
        if (!res.ok) return;
        const snapshot = await res.json();
        document.querySelector("[data-cost-date]").textContent = snapshot.date;
        document.querySelector("[data-cost-today]").textContent = Number(snapshot.todayUsd || 0).toFixed(2);
        document.querySelector("[data-cost-budget]").textContent = Number(snapshot.budgetUsd || 0).toFixed(2);
        const pct = snapshot.budgetUsd > 0 ? Math.min(100, Math.round((snapshot.todayUsd / snapshot.budgetUsd) * 100)) : 0;
        document.querySelector("[data-cost-bar]").style.width = pct + "%";
      } catch (e) { console.error("[cost-snapshot]", e); }
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError();
      const clientId = clientSelect.value;
      const skillId = skillSelect.value;
      const title = titleInput.value.trim();
      if (!clientId || !skillId || !title) {
        showError("請填入客戶、Skill 與任務標題");
        return;
      }
      submitBtn.disabled = true;

      // 「只問腦」模式：走 Meeting Room（SSE 串流），不走 dispatch
      if (currentMode === "consultation") {
        submitBtn.textContent = "三腦會議進行中...";
        statusLabel.textContent = "三腦會議中，觀看討論過程";
        await runBrainMeeting(clientId, skillId, title);
        submitBtn.disabled = false;
        submitBtn.textContent = "💡 開始三腦會議（只問腦）";
        return;
      }

      // 「腦+手」模式：走完整 dispatch
      submitBtn.textContent = "派發中...";
      statusLabel.textContent = "Dispatch 中，請稍候 3-8 秒";
      traceList.innerHTML = '<div class="surface-1 rounded-xl p-6 text-center text-muted text-sm">⏳ 等待 Claude 回應...</div>';
      briefSection.classList.add("hidden");
      committeeSection.classList.add("hidden");
      draftSection.classList.add("hidden");

      try {
        const res = await fetch("/api/demo/dispatch", {
          method: "POST",
          headers: { "content-type": "application/json", "x-confirm-cost": "true" },
          body: JSON.stringify({ clientId, skillId, title, type: typeSelect.value, createdBy: "partner" })
        });
        const body = await res.json();
        if (!res.ok) throw new Error(mapErrorCode(body?.error?.code, body?.error?.message));
        statusLabel.textContent = "完成 · " + (body.traces || []).length + " 段 trace";
        renderTraces(body.traces || []);
        setTimeout(() => {
          renderTaskBrief(body.taskBrief);
          renderCommittee(body.committeeReview);
          if (body.contentBody || body.output?.contentBody) {
            draftSection.classList.remove("hidden");
            draftOutput.textContent = body.contentBody || body.output.contentBody;
          }
        }, (body.traces || []).length * 300 + 200);
        await refreshCostSnapshot();
      } catch (err) {
        showError(err.message || "Dispatch 失敗");
        statusLabel.textContent = "失敗";
        traceList.innerHTML = '<div class="surface-1 rounded-xl p-6 text-center text-muted text-sm">請檢查錯誤訊息後重試</div>';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Dispatch · 開始三腦會議";
      }
    });

    clientSelect.addEventListener("change", () => {
      if (!titleInput.value) {
        const clientName = clientSelect.options[clientSelect.selectedIndex]?.text.split(" · ")[0] || "";
        titleInput.value = clientName + " · 示範任務";
      }
    });
  </script>`;

  return renderPageShell({
    title: "任務中心 · 双云 AI 行銷部",
    active: "demo",
    subtitle: "任務中心 · 三腦合一",
    body
  });
}

export function renderDemoCompare(input: DemoComparePageInput): string {
  const skillSelect = renderSkillSelect(input.catalog.skills, "compare-skill");
  const checkboxes = input.catalog.clients
    .map(
      (client, idx) => `<label class="surface-1 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-sky-400 transition">
  <input type="checkbox" name="clientIds" value="${escapeHtml(client.clientId)}" ${idx < 3 ? "checked" : ""} class="w-4 h-4">
  <div class="flex-1">
    <div class="font-bold text-sm text-primary">${escapeHtml(client.name)}</div>
    <div class="text-[11px] text-muted">${escapeHtml(client.industry)}</div>
  </div>
</label>`
    )
    .join("");

  const body = `
  ${renderCostCard(input.costSnapshot)}

  <section class="surface-2 rounded-2xl p-6">
    <div class="text-center mb-5">
      <div class="text-xs text-secondary uppercase tracking-widest font-semibold">同一個任務 · 多個品牌</div>
      <h2 class="text-xl font-bold text-primary mt-1">看三腦如何為每個品牌產出不同內容</h2>
    </div>
    <form id="compare-form" class="space-y-4">
      <div>
        <label class="block text-xs text-secondary mb-2 uppercase tracking-wider font-semibold">選擇 2-3 個品牌</label>
        <div class="grid grid-cols-3 gap-3">${checkboxes}</div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-secondary mb-1.5 uppercase tracking-wider font-semibold">共用 Skill</label>
          ${skillSelect}
        </div>
        <div>
          <label class="block text-xs text-secondary mb-1.5 uppercase tracking-wider font-semibold">任務標題</label>
          <input id="compare-title" name="title" type="text" class="input-field w-full rounded-lg px-3 py-2.5 text-sm" placeholder="例：五月母親節主題貼文">
        </div>
      </div>
      <button type="submit" id="compare-submit" class="btn-primary w-full py-3 rounded-lg text-sm font-bold transition">
        ⚡ Compare · 並行執行
      </button>
      <div id="compare-error" class="text-xs text-red-600 dark:text-red-300 hidden"></div>
    </form>
  </section>

  <div class="flex items-center justify-between text-xs text-secondary px-2">
    <div id="compare-progress">等待觸發</div>
    <div id="compare-total"></div>
  </div>

  <section id="compare-results" class="grid grid-cols-3 gap-5"></section>

  <script>
    const form = document.getElementById("compare-form");
    const submitBtn = document.getElementById("compare-submit");
    const errorPanel = document.getElementById("compare-error");
    const progressLabel = document.getElementById("compare-progress");
    const totalLabel = document.getElementById("compare-total");
    const resultsGrid = document.getElementById("compare-results");

    function escapeHtmlClient(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
    function mapErr(code, fallback) {
      const t = { INVALID_COMPARE_SIZE: "請選擇 2-3 個品牌", DAILY_BUDGET_EXCEEDED: "今日預算已用盡", MEMBER_QUOTA_EXCEEDED: "個人配額已用盡", INVALID_TOKEN: "登入已過期", INVALID_REQUEST: "請檢查欄位" };
      return t[code] || fallback || "發生錯誤";
    }
    function showError(msg) { errorPanel.textContent = msg; errorPanel.classList.remove("hidden"); }
    function clearError() { errorPanel.classList.add("hidden"); }

    const zoneClasses = ["brand-red", "brand-sky", "brand-amber"];

    function renderResultCard(result, idx) {
      const zoneClass = result.status === "failed" ? "brand-red" : (["zone-master","zone-shuangyun","zone-brand"][idx % 3]);
      if (result.status === "failed") {
        return '<article class="zone-master rounded-2xl p-5"><div class="flex items-center justify-between mb-3"><div class="font-bold text-primary">' + escapeHtmlClient(result.clientName || result.clientId) + '</div><span class="verdict-pill verdict-reject">failed</span></div><div class="text-xs text-red-600 dark:text-red-300">' + escapeHtmlClient(mapErr(result.error?.code, result.error?.message)) + '</div></article>';
      }
      const brief = result.taskBrief || {};
      const verdict = result.committeeReview?.verdict || result.verdict || "pending";
      const verdictClass = "verdict-" + (verdict === "major_rework" ? "rework" : verdict === "minor_tweak" ? "minor" : verdict);
      const content = (result.contentBody || "").slice(0, 400);
      return '<article class="' + zoneClass + ' rounded-2xl p-5 fade-in">' +
        '<div class="flex items-center justify-between mb-3">' +
        '<div class="font-bold text-primary">' + escapeHtmlClient(result.clientName || result.clientId) + '</div>' +
        '<span class="verdict-pill ' + verdictClass + '">' + escapeHtmlClient(verdict) + '</span>' +
        '</div>' +
        '<div class="text-xs text-secondary uppercase font-semibold mb-1">Angle</div>' +
        '<div class="text-sm font-semibold text-primary mb-3 leading-relaxed">' + escapeHtmlClient(brief.angle || "-") + '</div>' +
        '<div class="text-xs text-secondary uppercase font-semibold mb-1">Key Messages</div>' +
        '<div class="flex flex-wrap gap-1 mb-3">' + (brief.keyMessages || []).map(m => '<span class="px-2 py-0.5 bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded text-[11px]">' + escapeHtmlClient(m) + '</span>').join("") + '</div>' +
        '<div class="text-xs text-secondary uppercase font-semibold mb-1">內容初稿</div>' +
        '<pre class="text-xs text-secondary leading-relaxed mb-3 whitespace-pre-wrap font-sans" style="display:-webkit-box;-webkit-line-clamp:8;-webkit-box-orient:vertical;overflow:hidden;">' + escapeHtmlClient(content) + '</pre>' +
        '<div class="text-[11px] text-muted text-center border-t border-slate-200 dark:border-slate-700/60 pt-2">成本 $' + Number(result.costSummary?.estimatedUsd || 0).toFixed(4) + '</div>' +
        '</article>';
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError();
      const clientIds = Array.from(document.querySelectorAll('input[name="clientIds"]:checked')).map(i => i.value);
      if (clientIds.length < 2 || clientIds.length > 3) {
        showError("請選擇 2-3 個品牌");
        return;
      }
      const skillId = document.getElementById("compare-skill").value;
      const title = document.getElementById("compare-title").value.trim();
      if (!skillId || !title) { showError("請填入 Skill 與任務標題"); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = "並行執行中...";
      progressLabel.textContent = "Promise.allSettled · " + clientIds.length + " 個品牌並行中";
      resultsGrid.innerHTML = "";
      totalLabel.textContent = "";

      try {
        const res = await fetch("/api/demo/compare", {
          method: "POST",
          headers: { "content-type": "application/json", "x-confirm-cost": "true" },
          body: JSON.stringify({ clientIds, skillId, title })
        });
        const body = await res.json();
        if (!res.ok) throw new Error(mapErr(body?.error?.code, body?.error?.message));
        progressLabel.textContent = "完成";
        totalLabel.innerHTML = '總成本 <span class="text-amber-600 dark:text-amber-300 font-bold text-sm">$' + Number(body.totalCostUsd || 0).toFixed(4) + ' USD</span>';
        resultsGrid.innerHTML = (body.results || []).map(renderResultCard).join("");
      } catch (err) {
        showError(err.message || "Compare 失敗");
        progressLabel.textContent = "失敗";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "⚡ Compare · 並行執行";
      }
    });
  </script>`;

  return renderPageShell({
    title: "品牌對比 · 双云 AI 行銷部",
    active: "demo-compare",
    subtitle: "同一 Skill · 不同腦 · 不同產物",
    body
  });
}
