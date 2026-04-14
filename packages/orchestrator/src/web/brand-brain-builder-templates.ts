/**
 * 品牌腦 Builder SSR template — 上傳文件 + AI 生成 + 確認微調。
 * 視覺基礎來自 shared-templates.ts（淺色預設 + 深色切換）。
 */

import type { BrandBrain, BrandDataroomDoc, Client } from "@shuangyun/shared-types";
import { escapeHtml, renderPageShell, serializeJson } from "./shared-templates.js";

export type BrandBrainBuilderPageInput = {
  client: Client;
  brandBrain: BrandBrain | null;
  dataroom: BrandDataroomDoc[];
  viewerAlias: string;
};

const DOC_TYPES = [
  { key: "business_dev",        label: "業務開發紀錄",       icon: "💼", required: true,  hint: "初次拜訪、提案內容、成交前的對話，含老闆願景與紅線" },
  { key: "weekly_meeting",      label: "週會會議記錄",       icon: "📋", required: false, hint: "客戶與双云的定期會議紀要，含修正方向與 KPI 追蹤" },
  { key: "deep_search",         label: "品牌 Deep Search",  icon: "🔍", required: true,  hint: "品牌研究報告、競品分析、市場定位" },
  { key: "founder_personality", label: "品牌創辦人個性拆解", icon: "👤", required: false, hint: "創辦人訪談、社群觀察、語調分析" },
  { key: "brand_boundary",      label: "品牌邊界",          icon: "🚧", required: true,  hint: "合約約束、法規限制、禁談主題清單" }
] as const;

function renderUploadArea(doc: (typeof DOC_TYPES)[number], existingDocs: BrandDataroomDoc[]): string {
  const existing = existingDocs.filter(d => d.docType === doc.key);
  const hasExisting = existing.length > 0;
  const filesHtml = existing.map(d =>
    `<div class="text-xs text-secondary flex items-center gap-2 mt-1">
      <span class="text-emerald-600 dark:text-emerald-400">✓</span>
      <span>${escapeHtml(d.filename)}</span>
      <span class="text-muted">${Math.round(d.contentLength / 1024)}KB${d.truncated ? " (已截斷)" : ""}</span>
    </div>`
  ).join("");

  return `<div class="surface-1 rounded-xl p-5" data-doc-type="${doc.key}">
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <span class="text-2xl">${doc.icon}</span>
      <div>
        <div class="font-bold text-sm text-primary">${doc.label}</div>
        <div class="text-[11px] text-muted">${doc.hint}</div>
      </div>
    </div>
    ${doc.required ? '<span class="text-[10px] text-red-600 dark:text-red-400 font-bold uppercase">必填</span>' : '<span class="text-[10px] text-muted uppercase">選填</span>'}
  </div>
  <div class="relative">
    <input type="file" data-upload="${doc.key}" accept=".md,.txt,.docx" multiple
      class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
    <div class="surface-sunken rounded-lg p-4 text-center border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-sky-400 dark:hover:border-sky-500 transition">
      <div class="text-muted text-sm">${hasExisting ? "拖放新檔案覆蓋 或 點擊選檔" : "拖放 .md / .txt / .docx 或 點擊選檔"}</div>
      <div class="text-[11px] text-muted mt-1">每檔上限 50KB，可上傳 1-3 個</div>
    </div>
  </div>
  <div data-files="${doc.key}">${filesHtml}</div>
</div>`;
}

export function renderBrandBrainBuilder(input: BrandBrainBuilderPageInput): string {
  const { client, brandBrain, dataroom } = input;
  const uploadAreas = DOC_TYPES.map(doc => renderUploadArea(doc, dataroom)).join("");
  const hasBrain = brandBrain !== null;
  const brainVersion = brandBrain?.version ?? 0;

  const body = `
  <!-- Client header -->
  <div class="surface-2 rounded-2xl p-6 flex items-center justify-between">
    <div>
      <div class="text-xs text-secondary uppercase font-semibold tracking-wider">品牌腦 Builder</div>
      <h2 class="text-2xl font-bold text-primary mt-1">${escapeHtml(client.name)}</h2>
      <div class="text-sm text-secondary mt-1">${escapeHtml(client.industry)} · Client ID: <span class="mono text-muted">${escapeHtml(client.clientId)}</span></div>
    </div>
    <div class="text-right">
      ${hasBrain
        ? `<div class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">品牌腦已建立</div>
           <div class="text-2xl font-bold text-primary">v${brainVersion}</div>
           <div class="text-[11px] text-muted">上傳文件可升級</div>`
        : `<div class="text-xs text-amber-600 dark:text-amber-400 font-semibold">尚未建立品牌腦</div>
           <div class="text-sm text-muted mt-1">上傳文件讓 AI 自動生成</div>`
      }
    </div>
  </div>

  <!-- Step 1: Upload -->
  <section id="step-upload">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm uppercase tracking-widest text-secondary font-semibold">Step 1 — 上傳品牌文件</h3>
      <div class="text-xs text-muted" id="upload-status">${dataroom.length > 0 ? `已有 ${dataroom.length} 份文件` : "尚未上傳"}</div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${uploadAreas}
    </div>
    <div class="mt-4 flex items-center justify-between">
      <div id="upload-error" class="text-xs text-red-600 dark:text-red-300 hidden"></div>
      <button id="btn-upload" class="btn-primary px-6 py-2.5 rounded-lg text-sm font-bold transition" ${dataroom.length > 0 ? "" : "disabled"}>
        上傳到 Dataroom
      </button>
    </div>
  </section>

  <!-- Step 2: Generate -->
  <section id="step-generate" class="zone-merged rounded-2xl p-6">
    <div class="text-center mb-4">
      <div class="text-4xl pulse-slow">🧠</div>
      <h3 class="text-lg font-bold text-primary mt-2">Step 2 — AI 自動生成品牌腦</h3>
      <p class="text-xs text-muted mt-1">從 5 類文件萃取 → 生成 4 Agent Prompt + Strategy Notes + 品質自檢</p>
      <p class="text-xs text-muted">約 8 次 Claude call · 預估 15-30 秒 · ~$0.20 USD</p>
    </div>
    <div class="text-center">
      <button id="btn-generate" class="btn-primary px-8 py-3 rounded-lg text-sm font-bold transition">
        組裝品牌腦 <span class="text-[10px] opacity-70">免費</span>
      </button>
    </div>
    <div id="generate-spinner" class="hidden text-center mt-4">
      <div class="text-muted text-sm">⏳ AI 正在讀取文件並萃取品牌靈魂...</div>
      <div class="progress-bar mt-2 mx-auto" style="width:300px;"><span class="bar-sky" style="width:0%" id="gen-progress"></span></div>
    </div>
    <div id="generate-error" class="text-xs text-red-600 dark:text-red-300 hidden text-center mt-3"></div>
  </section>

  <!-- Step 3: Review & Confirm (hidden until generated) -->
  <section id="step-review" class="hidden space-y-6">
    <div class="flex items-center justify-between">
      <h3 class="text-sm uppercase tracking-widest text-secondary font-semibold">Step 3 — 確認與微調</h3>
      <div class="flex items-center gap-2">
        <button id="btn-regenerate" class="surface-1 px-4 py-2 rounded-lg text-xs font-semibold text-secondary hover:text-primary transition">🔄 重新生成</button>
        <button id="btn-edit-mode" class="surface-1 px-4 py-2 rounded-lg text-xs font-semibold text-secondary hover:text-primary transition">✏️ 手動微調</button>
        <button id="btn-confirm" class="btn-primary px-6 py-2.5 rounded-lg text-sm font-bold transition">✅ 確認存入</button>
      </div>
    </div>

    <!-- 4 Agent cards -->
    <div class="grid grid-cols-2 gap-4" id="agent-cards">
      ${["boss", "manager", "window", "brand"].map((role, idx) => {
        const icons = ["👑", "🧑‍💼", "📞", "🎨"];
        const labels = ["老闆 Agent · 願景紅線", "主管 Agent · 策略 KPI", "窗口 Agent · 日常偏好", "品牌 Agent · CI 守門"];
        return `<div class="surface-2 rounded-xl p-5" data-agent="${role}">
  <div class="flex items-center gap-2 mb-3">
    <span class="text-2xl">${icons[idx]}</span>
    <div>
      <div class="font-bold text-sm text-primary">${labels[idx]}</div>
      <div class="text-[10px] text-muted uppercase">${role} agent</div>
    </div>
  </div>
  <div class="agent-prompt-display text-xs text-secondary leading-relaxed whitespace-pre-wrap" data-display="${role}"></div>
  <textarea class="agent-prompt-edit input-field w-full rounded-lg p-3 text-xs hidden mt-2" data-edit="${role}" rows="8"></textarea>
</div>`;
      }).join("")}
    </div>

    <!-- Strategy Notes -->
    <div class="surface-2 rounded-xl p-5">
      <div class="font-bold text-sm text-primary mb-3">Strategy Notes</div>
      <div id="strategy-notes-display" class="space-y-2 text-xs text-secondary"></div>
      <textarea id="strategy-notes-edit" class="input-field w-full rounded-lg p-3 text-xs hidden mt-2" rows="6"></textarea>
    </div>

    <!-- Quality Report -->
    <div class="surface-2 rounded-xl p-5" id="quality-report">
      <div class="flex items-center justify-between mb-3">
        <div class="font-bold text-sm text-primary">品質自檢</div>
        <div id="quality-score" class="text-2xl font-bold"></div>
      </div>
      <div id="quality-issues" class="mb-3"></div>
      <div id="quality-suggestions"></div>
    </div>
  </section>

  <!-- Success message (hidden) -->
  <div id="confirm-success" class="hidden zone-hands rounded-2xl p-6 text-center">
    <div class="text-4xl mb-2">✅</div>
    <div class="text-xl font-bold text-primary">品牌腦已存入</div>
    <div class="text-sm text-secondary mt-2" id="confirm-version"></div>
    <a href="/demo" class="btn-primary inline-block px-6 py-2.5 rounded-lg text-sm font-bold mt-4">回到 Demo Console 試試看</a>
  </div>

  <script>
    const clientId = ${serializeJson(client.clientId)};
    const existingDataroom = ${serializeJson(dataroom.map(d => ({ docType: d.docType, filename: d.filename, contentLength: d.contentLength })))};
    const requiredTypes = ["business_dev", "deep_search", "brand_boundary"];
    let pendingDocs = {};
    let generatedResult = null;
    let editMode = false;

    function escHtml(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
    function showError(el, msg) { el.textContent = msg; el.classList.remove("hidden"); }
    function hideError(el) { el.classList.add("hidden"); }

    // File reading
    document.querySelectorAll("[data-upload]").forEach(input => {
      input.addEventListener("change", async () => {
        const docType = input.dataset.upload;
        const files = Array.from(input.files || []);
        if (files.length === 0) return;
        const filesContainer = document.querySelector("[data-files='" + docType + "']");
        filesContainer.innerHTML = "";
        pendingDocs[docType] = [];
        for (const file of files.slice(0, 3)) {
          try {
            const text = await file.text();
            const content = text.slice(0, 50000);
            const truncated = text.length > 50000;
            pendingDocs[docType].push({ docType, filename: file.name, content });
            filesContainer.innerHTML += '<div class="text-xs text-sky-600 dark:text-sky-400 flex items-center gap-2 mt-1"><span>📄</span><span>' + escHtml(file.name) + '</span><span class="text-muted">' + Math.round(content.length / 1024) + 'KB' + (truncated ? " (截斷)" : "") + '</span></div>';
          } catch (e) {
            filesContainer.innerHTML += '<div class="text-xs text-red-600 dark:text-red-400 mt-1">❌ ' + escHtml(file.name) + ' 讀取失敗</div>';
          }
        }
        document.getElementById("btn-upload").disabled = false;
      });
    });

    // Upload
    document.getElementById("btn-upload").addEventListener("click", async () => {
      const btn = document.getElementById("btn-upload");
      const errEl = document.getElementById("upload-error");
      hideError(errEl);
      const allDocs = Object.values(pendingDocs).flat();
      if (allDocs.length === 0) { showError(errEl, "請先選擇檔案"); return; }
      btn.disabled = true; btn.textContent = "上傳中...";
      try {
        const res = await fetch("/api/brand-brain-builder/" + encodeURIComponent(clientId) + "/upload", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ docs: allDocs })
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message || "上傳失敗");
        document.getElementById("upload-status").textContent = "已上傳 " + (body.uploaded?.length || allDocs.length) + " 份文件";
        pendingDocs = {};
      } catch (e) { showError(errEl, e.message); }
      finally { btn.disabled = false; btn.textContent = "上傳到 Dataroom"; }
    });

    // Generate
    document.getElementById("btn-generate").addEventListener("click", async () => {
      const btn = document.getElementById("btn-generate");
      const spinner = document.getElementById("generate-spinner");
      const errEl = document.getElementById("generate-error");
      const progress = document.getElementById("gen-progress");
      hideError(errEl);
      btn.disabled = true; btn.textContent = "生成中...";
      spinner.classList.remove("hidden");
      let pct = 0;
      const timer = setInterval(() => { pct = Math.min(pct + 3, 90); progress.style.width = pct + "%"; }, 500);
      try {
        const res = await fetch("/api/brand-brain-builder/" + encodeURIComponent(clientId) + "/generate", {
          method: "POST", headers: { "content-type": "application/json", "x-confirm-cost": "true" },
          body: "{}"
        });
        if (!res.ok) {
          const errBody = await res.text();
          try { throw new Error(JSON.parse(errBody)?.error?.message || "生成失敗"); }
          catch { throw new Error(errBody || "生成失敗（HTTP " + res.status + "）"); }
        }
        // 處理 NDJSON streaming（每步推送進度，最後一行是結果）
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let body = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.type === "progress") {
                const p = Math.min(msg.stepCount * 12, 95);
                progress.style.width = p + "%";
              } else if (msg.type === "done") {
                body = msg;
              } else if (msg.type === "error") {
                throw new Error(msg.error?.message || "品牌腦生成失敗");
              }
            } catch (parseErr) { if (parseErr.message !== line) throw parseErr; }
          }
        }
        if (!body) throw new Error("未收到完整生成結果");
        clearInterval(timer); progress.style.width = "100%";
        generatedResult = body;
        renderReview(body);
      } catch (e) { clearInterval(timer); showError(errEl, e.message); }
      finally { btn.disabled = false; btn.textContent = "組裝品牌腦（免費）"; setTimeout(() => spinner.classList.add("hidden"), 1000); }
    });

    function renderReview(result) {
      document.getElementById("step-review").classList.remove("hidden");
      const agents = result.agents || {};
      ["boss","manager","window","brand"].forEach(role => {
        const agent = agents[role] || {};
        const display = document.querySelector("[data-display='" + role + "']");
        const edit = document.querySelector("[data-edit='" + role + "']");
        const promptText = agent.systemPrompt || "(未生成)";
        display.innerHTML = escHtml(promptText).replace(/【來源：([^】]+)】/g, '<span class="px-1 py-0.5 bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded text-sky-700 dark:text-sky-300 text-[10px] font-semibold">📎 $1</span>');
        edit.value = promptText;
      });
      const notes = result.strategyNotes || [];
      document.getElementById("strategy-notes-display").innerHTML = notes.map((n, i) => '<div class="p-2 surface-sunken rounded">' + (i+1) + '. ' + escHtml(n) + '</div>').join("");
      document.getElementById("strategy-notes-edit").value = notes.join("\\n");
      const qr = result.qualityReport || {};
      const score = qr.qualityScore ?? 0;
      const scoreColor = score >= 80 ? "text-emerald-600 dark:text-emerald-300" : score >= 60 ? "text-amber-600 dark:text-amber-300" : "text-red-600 dark:text-red-300";
      document.getElementById("quality-score").className = "text-2xl font-bold " + scoreColor;
      document.getElementById("quality-score").textContent = score + " / 100";
      document.getElementById("quality-issues").innerHTML = (qr.issues || []).map(i => '<span class="inline-block px-2 py-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded text-red-700 dark:text-red-300 text-[11px] mr-1 mb-1">⚠️ ' + escHtml(i) + '</span>').join("");
      document.getElementById("quality-suggestions").innerHTML = (qr.suggestions || []).map(s => '<span class="inline-block px-2 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded text-amber-700 dark:text-amber-300 text-[11px] mr-1 mb-1">💡 ' + escHtml(s) + '</span>').join("");
      document.getElementById("step-review").scrollIntoView({ behavior: "smooth" });
    }

    // Edit mode
    document.getElementById("btn-edit-mode").addEventListener("click", () => {
      editMode = !editMode;
      document.querySelectorAll(".agent-prompt-display").forEach(el => el.classList.toggle("hidden", editMode));
      document.querySelectorAll(".agent-prompt-edit").forEach(el => el.classList.toggle("hidden", !editMode));
      document.getElementById("strategy-notes-display").classList.toggle("hidden", editMode);
      document.getElementById("strategy-notes-edit").classList.toggle("hidden", !editMode);
      document.getElementById("btn-edit-mode").textContent = editMode ? "📖 回到檢視" : "✏️ 手動微調";
    });

    // Regenerate
    document.getElementById("btn-regenerate").addEventListener("click", () => {
      document.getElementById("step-review").classList.add("hidden");
      document.getElementById("btn-generate").click();
    });

    // Confirm
    document.getElementById("btn-confirm").addEventListener("click", async () => {
      const btn = document.getElementById("btn-confirm");
      btn.disabled = true; btn.textContent = "儲存中...";
      try {
        const agents = {};
        ["boss","manager","window","brand"].forEach(role => {
          const promptText = editMode
            ? document.querySelector("[data-edit='" + role + "']").value
            : (generatedResult?.agents?.[role]?.systemPrompt || "");
          agents[role] = {
            systemPrompt: promptText,
            responsibilities: generatedResult?.agents?.[role]?.responsibilities || [],
            dataroomRefs: generatedResult?.agents?.[role]?.dataroomRefs || []
          };
        });
        const strategyNotes = editMode
          ? document.getElementById("strategy-notes-edit").value.split("\\n").filter(Boolean)
          : (generatedResult?.strategyNotes || []);
        const res = await fetch("/api/brand-brain-builder/" + encodeURIComponent(clientId) + "/confirm", {
          method: "PUT", headers: { "content-type": "application/json" },
          body: JSON.stringify({ agents, strategyNotes })
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message || "儲存失敗");
        document.getElementById("step-upload").classList.add("hidden");
        document.getElementById("step-generate").classList.add("hidden");
        document.getElementById("step-review").classList.add("hidden");
        document.getElementById("confirm-success").classList.remove("hidden");
        document.getElementById("confirm-version").textContent = "Brand Brain v" + (body.version || "?") + " · Brain ID: " + (body.brainId || "");
      } catch (e) { alert("儲存失敗：" + e.message); }
      finally { btn.disabled = false; btn.textContent = "✅ 確認存入"; }
    });
  </script>`;

  return renderPageShell({
    title: `品牌腦 Builder · ${client.name} · 双云 AI 行銷部`,
    active: "members",
    subtitle: `品牌腦 Builder · ${client.name}`,
    body
  });
}
