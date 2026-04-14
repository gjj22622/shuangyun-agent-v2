/**
 * 工作流建構器 SSR templates。
 * /workflows — 工作流列表
 * /workflows/:id — 拖放式工作流編輯器（SVG canvas）
 */

import { escapeHtml, renderPageShell } from "./shared-templates.js";

export type WorkflowListItem = {
  workflowId: string;
  name: string;
  clientName: string;
  nodeCount: number;
  version: number;
  updatedAt: string;
  createdBy: string;
};

export type WorkflowListPageInput = {
  workflows: WorkflowListItem[];
  viewerRole: string;
};

export type SkillOption = {
  skillId: string;
  name: string;
  category: string;
  kind: string; // "sub_agent" = 腦, "workflow" = 手
};

export type ClientOption = {
  clientId: string;
  name: string;
};

export type BrandBrainOption = {
  clientId: string;
  clientName: string;
  version: number;
};

export type WorkflowBuilderPageInput = {
  workflowId: string | null; // null = 新建
  workflowName: string;
  clientId: string;
  nodesJson: string;  // JSON string
  edgesJson: string;  // JSON string
  skills: SkillOption[];
  clients: ClientOption[];
  brandBrains: BrandBrainOption[];
};

/* ═══════════════════ 列表頁 ═══════════════════ */

export function renderWorkflowList(input: WorkflowListPageInput): string {
  const rows = input.workflows.map(w =>
    `<tr class="hover:bg-slate-50 dark:hover:bg-white/[.03]">
      <td class="px-4 py-3"><a href="/workflows/${escapeHtml(w.workflowId)}" class="font-bold text-sky-600 dark:text-sky-400 hover:underline">${escapeHtml(w.name)}</a></td>
      <td class="px-4 py-3 text-xs text-muted">${escapeHtml(w.clientName)}</td>
      <td class="px-4 py-3 text-xs text-center">${w.nodeCount}</td>
      <td class="px-4 py-3 text-xs text-muted">v${w.version}</td>
      <td class="px-4 py-3 text-xs text-muted">${escapeHtml(w.createdBy)}</td>
      <td class="px-4 py-3 text-xs text-muted">${escapeHtml(w.updatedAt.slice(0, 10))}</td>
    </tr>`
  ).join("");

  const body = `
  <div class="flex items-center justify-between mb-6">
    <div>
      <h2 class="text-2xl font-bold text-primary">工作流</h2>
      <p class="text-xs text-muted mt-1">腦+手拖放式自動化流程</p>
    </div>
    ${input.viewerRole !== "viewer" ? '<a href="/workflows/new" class="btn-primary px-5 py-2.5 rounded-lg text-sm font-bold transition">+ 新增工作流</a>' : ""}
  </div>

  <section class="surface-2 rounded-2xl overflow-hidden">
    <table class="w-full text-sm">
      <thead class="text-xs text-muted uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
        <tr>
          <th class="text-left px-4 py-3 font-semibold">名稱</th>
          <th class="text-left px-4 py-3 font-semibold">客戶</th>
          <th class="text-center px-4 py-3 font-semibold">節點</th>
          <th class="text-left px-4 py-3 font-semibold">版本</th>
          <th class="text-left px-4 py-3 font-semibold">建立者</th>
          <th class="text-left px-4 py-3 font-semibold">更新日期</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200 dark:divide-slate-800/60">
        ${rows || '<tr><td colspan="6" class="text-center py-8 text-muted">尚未建立工作流</td></tr>'}
      </tbody>
    </table>
  </section>`;

  return renderPageShell({
    title: "工作流 · 双云 AI 行銷部",
    active: "workflows",
    subtitle: "工作流",
    body
  });
}

/* ═══════════════════ 編輯器頁 ═══════════════════ */

export function renderWorkflowBuilder(input: WorkflowBuilderPageInput): string {
  const brainSkills = input.skills.filter(s => s.kind === "sub_agent");
  const handSkills = input.skills.filter(s => s.kind !== "sub_agent");

  const brainSkillItems = brainSkills.map(s =>
    `<div class="node-item brain-item surface-1 rounded-lg p-2 mb-2 cursor-grab text-xs hover:border-violet-400 border border-transparent transition" data-draggable="true" data-type="brain" data-brain-type="skill" data-skill-id="${escapeHtml(s.skillId)}" data-label="${escapeHtml(s.name)}">
      <span class="mr-1">🧠</span> ${escapeHtml(s.name)}
      <div class="text-[10px] text-muted">${escapeHtml(s.category)} · <span class="text-violet-600">Skill 腦</span></div>
    </div>`
  ).join("");

  const skillItems = handSkills.map(s =>
    `<div class="node-item skill-item surface-1 rounded-lg p-2 mb-2 cursor-grab text-xs hover:border-emerald-400 border border-transparent transition" data-draggable="true" data-type="skill" data-skill-id="${escapeHtml(s.skillId)}" data-label="${escapeHtml(s.name)}">
      <span class="mr-1">✋</span> ${escapeHtml(s.name)}
      <div class="text-[10px] text-muted">${escapeHtml(s.category)}</div>
    </div>`
  ).join("");

  const clientOptions = input.clients.map(c =>
    `<option value="${escapeHtml(c.clientId)}" ${c.clientId === input.clientId ? "selected" : ""}>${escapeHtml(c.name)}</option>`
  ).join("");

  const body = `
  <style>
    .wf-layout { display: grid; grid-template-columns: 220px 1fr 260px; gap: 0; height: calc(100vh - 140px); }
    .wf-panel { overflow-y: auto; border-right: 1px solid var(--border-color, #e2e8f0); }
    .wf-panel-right { border-left: 1px solid var(--border-color, #e2e8f0); border-right: none; }
    .dark .wf-panel, .dark .wf-panel-right { border-color: rgba(255,255,255,0.08); }
    .wf-canvas-wrap { overflow: hidden; position: relative; z-index: 0; background: repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(0,0,0,0.03) 19px, rgba(0,0,0,0.03) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(0,0,0,0.03) 19px, rgba(0,0,0,0.03) 20px); }
    .dark .wf-canvas-wrap { background: repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(255,255,255,0.03) 19px, rgba(255,255,255,0.03) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(255,255,255,0.03) 19px, rgba(255,255,255,0.03) 20px); }
    .node-item:active { cursor: grabbing; }
    .svg-node { cursor: move; }
    .svg-node:hover rect, .svg-node:hover circle { filter: brightness(1.1); }
    .svg-node.selected rect { stroke-width: 2.5; }
    .svg-endpoint { cursor: crosshair; pointer-events: all; }
    .svg-endpoint:hover { r: 10; filter: brightness(1.3); }
    .svg-edge { stroke: #94a3b8; stroke-width: 2; fill: none; }
    .dark .svg-edge { stroke: #475569; }
  </style>

  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-3">
      <a href="/workflows" class="text-xs text-muted hover:text-primary transition">&larr; 返回列表</a>
      <input id="wf-name" type="text" value="${escapeHtml(input.workflowName)}" placeholder="工作流名稱" class="input-field px-3 py-1.5 rounded-lg text-sm font-bold w-64" />
    </div>
    <div class="flex gap-2">
      <button id="btn-save" class="surface-1 px-4 py-2 rounded-lg text-xs font-semibold hover:text-primary transition">💾 儲存</button>
      <button id="btn-run" class="btn-primary px-4 py-2 rounded-lg text-xs font-bold transition">▶ 執行</button>
    </div>
  </div>

  <div class="wf-layout rounded-2xl overflow-hidden surface-2">
    <!-- 左面板：節點庫 -->
    <div class="wf-panel p-3">
      <div class="text-xs font-bold text-primary uppercase tracking-wider mb-3">節點庫</div>
      <div class="text-[10px] text-secondary mb-3 leading-relaxed">腦↔腦連結 = 討論會議<br/>討論結果 → 總指令 → 手節點</div>

      <div class="text-[10px] text-muted uppercase tracking-wider mb-1 mt-2">双云策略腦 <span class="text-emerald-600">免費</span></div>
      <div class="node-item brain-item surface-1 rounded-lg p-2 mb-2 cursor-grab text-xs hover:border-sky-400 border border-transparent transition" data-draggable="true" data-type="brain" data-brain-type="strategy" data-label="双云策略腦">
        <span class="mr-1">🧠</span> 双云策略腦
        <div class="text-[10px] text-muted">SOSTAC 方法論 · <span class="text-emerald-600">0 token</span></div>
      </div>

      <div class="text-[10px] text-muted uppercase tracking-wider mb-1 mt-2">師傅腦 <span class="text-emerald-600">免費</span></div>
      <div class="node-item brain-item surface-1 rounded-lg p-2 mb-2 cursor-grab text-xs hover:border-red-400 border border-transparent transition" data-draggable="true" data-type="brain" data-brain-type="master" data-label="師傅腦">
        <span class="mr-1">🎓</span> 師傅腦
        <div class="text-[10px] text-muted">Jacky 案例庫 · <span class="text-emerald-600">0 token</span></div>
      </div>

      <div class="text-[10px] text-muted uppercase tracking-wider mb-1 mt-2">品牌腦</div>
      ${input.brandBrains.length > 0 ? input.brandBrains.map(bb =>
        `<div class="node-item brain-item surface-1 rounded-lg p-2 mb-2 cursor-grab text-xs hover:border-amber-400 border border-transparent transition" data-draggable="true" data-type="brain" data-brain-type="brand" data-client-id="${escapeHtml(bb.clientId)}" data-label="${escapeHtml(bb.clientName)} 品牌腦">
          <span class="mr-1">🏷️</span> ${escapeHtml(bb.clientName)}
          <div class="text-[10px] text-muted">v${bb.version} · 品牌知識</div>
        </div>`
      ).join("") : '<div class="text-[10px] text-muted py-1 pl-1">尚無品牌腦（先建立客戶）</div>'}

      ${brainSkillItems ? '<div class="text-[10px] text-muted uppercase tracking-wider mb-1 mt-3">Skill 腦 <span class="text-violet-600">按需調用</span></div>' + brainSkillItems : ''}

      <div class="text-[10px] text-muted uppercase tracking-wider mb-1 mt-4">手節點（Skills）<span class="text-amber-600">~$0.005/次</span></div>
      ${skillItems || '<div class="text-[10px] text-muted py-2">無可用 Skill</div>'}
    </div>

    <!-- 中間：SVG Canvas -->
    <div class="wf-canvas-wrap" id="canvas-wrap">
      <svg id="wf-canvas" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
          </marker>
        </defs>
        <g id="edges-layer"></g>
        <g id="nodes-layer"></g>
        <line id="temp-edge" class="svg-edge" style="display:none" marker-end="url(#arrowhead)" />
      </svg>
    </div>

    <!-- 右面板：節點設定 -->
    <div class="wf-panel-right p-3" id="config-panel">
      <div class="text-xs font-bold text-primary uppercase tracking-wider mb-3">節點設定</div>
      <div id="config-empty" class="text-xs text-muted py-4 text-center">點擊 canvas 上的節點<br/>查看設定</div>
      <div id="config-content" class="hidden">
        <div class="mb-3">
          <label class="text-[10px] text-muted uppercase">標籤</label>
          <input id="cfg-label" type="text" class="input-field w-full px-2 py-1 rounded text-xs mt-1" />
        </div>
        <div id="cfg-brain-section" class="hidden">
          <div class="mb-2 px-2 py-1.5 rounded-lg surface-sunken text-xs font-bold" id="cfg-brain-type-label">🧠 双云策略腦</div>
          <div class="mb-3" id="cfg-client-row">
            <label class="text-[10px] text-muted uppercase">綁定客戶</label>
            <select id="cfg-client" class="input-field w-full px-2 py-1 rounded text-xs mt-1">
              ${clientOptions}
            </select>
          </div>
          <div class="mb-3">
            <label class="text-[10px] text-muted uppercase">策略指令（可選）</label>
            <textarea id="cfg-brain-prompt" class="input-field w-full px-2 py-1 rounded text-xs mt-1" rows="4" placeholder="額外策略指令..."></textarea>
          </div>
        </div>
        <div id="cfg-skill-section" class="hidden">
          <div class="mb-3">
            <label class="text-[10px] text-muted uppercase">Skill</label>
            <div id="cfg-skill-name" class="text-xs text-primary font-bold mt-1"></div>
            <div id="cfg-skill-cat" class="text-[10px] text-muted"></div>
          </div>
          <div class="mb-3">
            <label class="text-[10px] text-muted uppercase">可用 Connector</label>
            <div id="cfg-connectors" class="mt-1 space-y-1 text-[10px]"></div>
          </div>
        </div>
        <button id="cfg-delete" class="w-full mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 surface-1 hover:bg-red-50 dark:hover:bg-red-900/20 transition">刪除節點</button>
      </div>
    </div>
  </div>

  <!-- 執行結果 modal -->
  <div id="run-modal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick="if(event.target===this)this.classList.add('hidden')">
    <div class="surface-2 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
      <h3 class="text-lg font-bold text-primary mb-3">執行結果</h3>
      <div id="run-steps" class="space-y-3"></div>
      <div class="flex justify-end mt-4">
        <button class="surface-1 px-4 py-2 rounded-lg text-xs font-semibold" onclick="document.getElementById('run-modal').classList.add('hidden')">關閉</button>
      </div>
    </div>
  </div>

  <script>
  (function() {
    const WORKFLOW_ID = ${input.workflowId ? `"${escapeHtml(input.workflowId)}"` : "null"};
    const NODE_W = 160, NODE_H = 56, EP_R = 8;
    let nodes = ${input.nodesJson};
    let edges = ${input.edgesJson};
    let selectedNodeId = null;
    let nextNodeNum = nodes.length + 1;
    const svg = document.getElementById("wf-canvas");
    const nodesLayer = document.getElementById("nodes-layer");
    const edgesLayer = document.getElementById("edges-layer");
    const tempEdge = document.getElementById("temp-edge");

    /* ─── 繪製工具 ─── */
    function createSvgEl(tag, attrs) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    }

    function bezierPath(x1, y1, x2, y2) {
      const dx = Math.abs(x2 - x1) * 0.5;
      return "M" + x1 + "," + y1 + " C" + (x1+dx) + "," + y1 + " " + (x2-dx) + "," + y2 + " " + x2 + "," + y2;
    }

    /* ─── 節點渲染 ─── */
    const BRAIN_STYLES = {
      strategy: { fill: "#e0f2fe", stroke: "#0ea5e9", icon: "🧠", sub: "双云策略" },
      master:   { fill: "#fee2e2", stroke: "#dc2626", icon: "🎓", sub: "師傅腦" },
      brand:    { fill: "#fef3c7", stroke: "#f59e0b", icon: "🏷️", sub: "品牌腦" },
      skill:    { fill: "#ede9fe", stroke: "#8b5cf6", icon: "🧠", sub: "Skill 腦" }
    };

    function renderNode(node) {
      const g = createSvgEl("g", { class: "svg-node", "data-id": node.nodeId, transform: "translate(" + node.position.x + "," + node.position.y + ")" });

      const isBrain = node.type === "brain";
      const brainType = node.brainConfig?.brainType || "strategy";
      const style = isBrain ? (BRAIN_STYLES[brainType] || BRAIN_STYLES.strategy) : { fill: "#ecfdf5", stroke: "#10b981", icon: "✋", sub: node.skillId || "" };
      const rx = isBrain ? "16" : "8";

      g.innerHTML = '<rect width="' + NODE_W + '" height="' + NODE_H + '" rx="' + rx + '" fill="' + style.fill + '" stroke="' + style.stroke + '" stroke-width="1.5" class="node-rect" />' +
        '<text x="14" y="24" font-size="14">' + style.icon + '</text>' +
        '<text x="34" y="24" font-size="12" font-weight="bold" fill="#1e293b">' + escHtml(node.label) + '</text>' +
        '<text x="34" y="40" font-size="10" fill="#64748b">' + escHtml(style.sub) + '</text>' +
        '<circle cx="0" cy="' + (NODE_H/2) + '" r="' + EP_R + '" fill="' + style.stroke + '" class="svg-endpoint ep-in" data-ep="in" />' +
        '<circle cx="' + NODE_W + '" cy="' + (NODE_H/2) + '" r="' + EP_R + '" fill="' + style.stroke + '" class="svg-endpoint ep-out" data-ep="out" />';

      nodesLayer.appendChild(g);
      return g;
    }

    function renderEdge(edge) {
      const fromNode = nodes.find(n => n.nodeId === edge.from);
      const toNode = nodes.find(n => n.nodeId === edge.to);
      if (!fromNode || !toNode) return;
      const x1 = fromNode.position.x + NODE_W;
      const y1 = fromNode.position.y + NODE_H / 2;
      const x2 = toNode.position.x;
      const y2 = toNode.position.y + NODE_H / 2;
      // 腦↔腦 = 討論（虛線+雙箭頭）；腦→手 = 指令（實線+箭頭）
      const isBrainToBrain = fromNode.type === "brain" && toNode.type === "brain";
      const path = createSvgEl("path", {
        d: bezierPath(x1, y1, x2, y2),
        class: "svg-edge",
        "data-edge-id": edge.edgeId,
        "marker-end": "url(#arrowhead)",
        "stroke-dasharray": isBrainToBrain ? "6,4" : "none",
        stroke: isBrainToBrain ? "#8b5cf6" : "#94a3b8"
      });
      edgesLayer.appendChild(path);
      // 腦↔腦連線加「討論」標記
      if (isBrainToBrain) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 8;
        const label = createSvgEl("text", { x: String(mx), y: String(my), "font-size": "9", fill: "#8b5cf6", "text-anchor": "middle" });
        label.textContent = "討論";
        edgesLayer.appendChild(label);
      }
    }

    function renderAll() {
      nodesLayer.innerHTML = "";
      edgesLayer.innerHTML = "";
      nodes.forEach(renderNode);
      edges.forEach(renderEdge);
    }

    function escHtml(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c] || c); }

    /* ─── 從面板新增節點（click-to-add，最可靠） ─── */
    const canvasWrap = document.getElementById("canvas-wrap");
    let addCount = 0;
    document.querySelectorAll(".node-item").forEach(item => {
      // 點擊面板節點 → 直接加到 canvas 中央偏移位置
      item.addEventListener("click", () => {
        const rect = svg.getBoundingClientRect();
        const offsetX = 80 + (addCount % 4) * 180;
        const offsetY = 60 + Math.floor(addCount / 4) * 80;
        addCount++;
        const nodeId = "node_" + (nextNodeNum++);
        const data = {
          type: item.dataset.type,
          skillId: item.dataset.skillId || "",
          label: item.dataset.label || "",
          brainType: item.dataset.brainType || "",
          clientId: item.dataset.clientId || ""
        };
        const node = {
          nodeId,
          type: data.type,
          skillId: data.skillId || undefined,
          brainConfig: data.type === "brain" ? {
            brainType: data.brainType || "strategy",
            clientId: data.clientId || "",
            prompt: ""
          } : undefined,
          label: data.label || nodeId,
          position: { x: offsetX, y: offsetY },
          config: {}
        };
        nodes.push(node);
        renderNode(node);
        selectNode(nodeId);
        // 視覺回饋
        item.style.opacity = "0.5";
        setTimeout(() => { item.style.opacity = "1"; }, 200);
      });
      // 改 cursor 提示可點擊
      item.style.cursor = "pointer";
    });

    /* ─── 節點拖動 ─── */
    let dragNode = null, dragOffset = { x: 0, y: 0 };
    svg.addEventListener("mousedown", e => {
      const nodeG = e.target.closest(".svg-node");
      if (!nodeG) { selectNode(null); return; }
      const ep = e.target.closest(".svg-endpoint");
      if (ep) { startEdgeDrag(nodeG, ep, e); return; }
      const nodeId = nodeG.dataset.id;
      selectNode(nodeId);
      dragNode = nodeId;
      const node = nodes.find(n => n.nodeId === nodeId);
      if (node) {
        const rect = svg.getBoundingClientRect();
        dragOffset = { x: e.clientX - rect.left - node.position.x, y: e.clientY - rect.top - node.position.y };
      }
    });

    svg.addEventListener("mousemove", e => {
      if (edgeDragFrom) { updateTempEdge(e); return; }
      if (!dragNode) return;
      const node = nodes.find(n => n.nodeId === dragNode);
      if (!node) return;
      const rect = svg.getBoundingClientRect();
      node.position.x = Math.max(0, e.clientX - rect.left - dragOffset.x);
      node.position.y = Math.max(0, e.clientY - rect.top - dragOffset.y);
      const g = nodesLayer.querySelector('[data-id="' + dragNode + '"]');
      if (g) g.setAttribute("transform", "translate(" + node.position.x + "," + node.position.y + ")");
      updateEdges();
    });

    svg.addEventListener("mouseup", e => {
      if (edgeDragFrom) { finishEdgeDrag(e); return; }
      dragNode = null;
    });

    function updateEdges() {
      edgesLayer.innerHTML = "";
      edges.forEach(renderEdge);
    }

    /* ─── 連線拖拉 ─── */
    let edgeDragFrom = null;
    function startEdgeDrag(nodeG, ep, e) {
      if (ep.dataset.ep !== "out") return;
      edgeDragFrom = nodeG.dataset.id;
      const node = nodes.find(n => n.nodeId === edgeDragFrom);
      if (!node) return;
      tempEdge.setAttribute("x1", node.position.x + NODE_W);
      tempEdge.setAttribute("y1", node.position.y + NODE_H / 2);
      tempEdge.style.display = "";
      e.stopPropagation();
    }

    function updateTempEdge(e) {
      const rect = svg.getBoundingClientRect();
      tempEdge.setAttribute("x2", e.clientX - rect.left);
      tempEdge.setAttribute("y2", e.clientY - rect.top);
    }

    function finishEdgeDrag(e) {
      tempEdge.style.display = "none";
      // 寬鬆偵測：先找端點，找不到就找最近的節點（20px 內）
      let targetNodeId = null;
      const epTarget = e.target.closest(".svg-endpoint[data-ep='in']");
      if (epTarget) {
        targetNodeId = epTarget.closest(".svg-node")?.dataset.id;
      }
      if (!targetNodeId) {
        // fallback: 找 mouseup 位置最近的節點入口端點
        const rect = svg.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        let minDist = 40; // 40px 容錯範圍
        for (const n of nodes) {
          if (n.nodeId === edgeDragFrom) continue;
          const dx = n.position.x - mx;
          const dy = (n.position.y + NODE_H / 2) - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) { minDist = dist; targetNodeId = n.nodeId; }
        }
      }
      if (targetNodeId && targetNodeId !== edgeDragFrom) {
        const exists = edges.some(ed => ed.from === edgeDragFrom && ed.to === targetNodeId);
        if (!exists) {
          const edge = { edgeId: "edge_" + Date.now(), from: edgeDragFrom, to: targetNodeId };
          edges.push(edge);
          renderEdge(edge);
        }
      }
      edgeDragFrom = null;
    }

    /* ─── 選取 + 設定面板 ─── */
    function selectNode(nodeId) {
      selectedNodeId = nodeId;
      nodesLayer.querySelectorAll(".svg-node").forEach(g => g.classList.remove("selected"));
      const cfg = document.getElementById("config-content");
      const empty = document.getElementById("config-empty");
      if (!nodeId) { cfg.classList.add("hidden"); empty.classList.remove("hidden"); return; }
      const g = nodesLayer.querySelector('[data-id="' + nodeId + '"]');
      if (g) g.classList.add("selected");
      const node = nodes.find(n => n.nodeId === nodeId);
      if (!node) return;
      empty.classList.add("hidden"); cfg.classList.remove("hidden");
      document.getElementById("cfg-label").value = node.label;
      const brainSec = document.getElementById("cfg-brain-section");
      const skillSec = document.getElementById("cfg-skill-section");
      if (node.type === "brain") {
        brainSec.classList.remove("hidden"); skillSec.classList.add("hidden");
        const bt = node.brainConfig?.brainType || "strategy";
        const btLabel = bt === "strategy" ? "🧠 双云策略腦" : bt === "master" ? "🎓 師傅腦" : "🏷️ 品牌腦";
        document.getElementById("cfg-brain-type-label").textContent = btLabel;
        if (node.brainConfig) {
          document.getElementById("cfg-client").value = node.brainConfig.clientId || "";
          document.getElementById("cfg-brain-prompt").value = node.brainConfig.prompt || "";
        }
        // 品牌腦才顯示客戶選擇
        document.getElementById("cfg-client-row").style.display = bt === "brand" ? "" : "none";
      } else {
        skillSec.classList.remove("hidden"); brainSec.classList.add("hidden");
        document.getElementById("cfg-skill-name").textContent = node.skillId || "";
        document.getElementById("cfg-skill-cat").textContent = node.label || node.type;
        // 載入可用 Connector
        fetch("/api/connectors").then(r => r.json()).then(data => {
          const div = document.getElementById("cfg-connectors");
          if (div && data.connectors) {
            div.innerHTML = data.connectors.map(c =>
              '<div class="flex items-center gap-1">' +
              (c.available ? '<span class="text-emerald-600">✓</span>' : '<span class="text-muted">✗</span>') +
              '<span class="' + (c.available ? 'text-primary' : 'text-muted') + '">' + escHtml(c.name) + '</span>' +
              '</div>'
            ).join("");
          }
        }).catch(() => {});
      }
    }

    document.getElementById("cfg-label").addEventListener("change", e => {
      const node = nodes.find(n => n.nodeId === selectedNodeId);
      if (node) { node.label = e.target.value; renderAll(); selectNode(selectedNodeId); }
    });

    document.getElementById("cfg-client").addEventListener("change", e => {
      const node = nodes.find(n => n.nodeId === selectedNodeId);
      if (node?.brainConfig) node.brainConfig.clientId = e.target.value;
    });

    document.getElementById("cfg-brain-prompt").addEventListener("change", e => {
      const node = nodes.find(n => n.nodeId === selectedNodeId);
      if (node?.brainConfig) node.brainConfig.prompt = e.target.value;
    });

    document.getElementById("cfg-delete").addEventListener("click", () => {
      if (!selectedNodeId) return;
      nodes = nodes.filter(n => n.nodeId !== selectedNodeId);
      edges = edges.filter(ed => ed.from !== selectedNodeId && ed.to !== selectedNodeId);
      selectNode(null);
      renderAll();
    });

    document.addEventListener("keydown", e => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId && !e.target.closest("input,textarea,select")) {
        document.getElementById("cfg-delete").click();
      }
    });

    /* ─── 儲存 ─── */
    document.getElementById("btn-save").addEventListener("click", async () => {
      const name = document.getElementById("wf-name").value.trim();
      if (!name) { alert("請輸入工作流名稱"); return; }
      const clientId = document.getElementById("cfg-client")?.value || (nodes.find(n => n.type === "brain")?.brainConfig?.clientId) || "";
      const body = JSON.stringify({ name, clientId, nodes, edges });
      const btn = document.getElementById("btn-save");
      btn.disabled = true; btn.textContent = "儲存中...";
      try {
        const method = WORKFLOW_ID ? "PUT" : "POST";
        const url = WORKFLOW_ID ? "/api/workflows/" + WORKFLOW_ID : "/api/workflows";
        const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "儲存失敗");
        if (!WORKFLOW_ID && data.workflowId) {
          window.location.href = "/workflows/" + data.workflowId;
        } else {
          btn.textContent = "已儲存 ✓";
          setTimeout(() => { btn.textContent = "💾 儲存"; }, 1500);
        }
      } catch (e) { alert(e.message); }
      finally { btn.disabled = false; }
    });

    /* ─── 執行 ─── */
    document.getElementById("btn-run").addEventListener("click", async () => {
      if (!WORKFLOW_ID) { alert("請先儲存工作流"); return; }
      const btn = document.getElementById("btn-run");
      btn.disabled = true; btn.textContent = "執行中...";
      try {
        const res = await fetch("/api/workflows/" + WORKFLOW_ID + "/run", {
          method: "POST",
          headers: { "content-type": "application/json", "x-confirm-cost": "true" }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "執行失敗");
        // 顯示結果
        const stepsDiv = document.getElementById("run-steps");
        stepsDiv.innerHTML = '<div class="text-xs text-muted">executionId: ' + escHtml(data.executionId || "") + '</div>';
        if (data.steps) {
          data.steps.forEach(step => {
            const hasError = !!step.error;
            const typeLabel = step.type === "brain" ? "🧠 腦" : "✋ 手";
            const costLabel = step.costEstimatedUsd > 0 ? " · $" + step.costEstimatedUsd.toFixed(4) : " · 免費";
            const statusColor = hasError ? "text-red-600" : "text-emerald-600";
            const statusText = hasError ? "失敗" : "完成";
            const raw = step.content || step.error || "（無內容）";
            // 偵測圖片/影片 URL 顯示為媒體
            const urlMatch = raw.match(/https?:\/\/\S+\.(png|jpg|jpeg|webp|gif|mp4)/i);
            const mediaHtml = urlMatch ? '<div class="mt-2"><img src="' + escHtml(urlMatch[0]) + '" class="max-w-full max-h-40 rounded-lg" onerror="this.style.display=\'none\'" /></div>' : '';
            const contentPreview = raw.replace(/https?:\/\/\S+/g, url => '<a href="' + escHtml(url) + '" target="_blank" class="text-sky-600 underline">' + escHtml(url.slice(0, 60)) + '...</a>').slice(0, 400);
            stepsDiv.innerHTML += '<div class="surface-1 rounded-lg p-3 mb-2">' +
              '<div class="flex justify-between mb-1">' +
              '<span class="font-bold text-xs">' + typeLabel + ' ' + escHtml(step.nodeId) + costLabel + '</span>' +
              '<span class="text-xs ' + statusColor + '">' + statusText + '</span>' +
              '</div>' +
              '<div class="text-xs text-secondary whitespace-pre-wrap leading-relaxed">' + contentPreview + '</div>' +
              mediaHtml +
              '</div>';
          });
        }
        document.getElementById("run-modal").classList.remove("hidden");
      } catch (e) { alert(e.message); }
      finally { btn.disabled = false; btn.textContent = "▶ 執行"; }
    });

    /* ─── 初始化 ─── */
    renderAll();
  })();
  </script>`;

  return renderPageShell({
    title: (input.workflowId ? "編輯" : "新增") + "工作流 · 双云 AI 行銷部",
    active: "workflows",
    subtitle: "工作流建構器",
    body
  });
}
