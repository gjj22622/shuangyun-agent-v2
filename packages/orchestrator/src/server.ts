/**
 * V2 双云 AI Agent — Server
 * 3 頁面：/library（腦手資料庫）/ /workflows（工作流建構+執行）/ /brands（品牌管理）
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
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}
function esc(s: unknown): string { return escapeHtml(s); }

/* ─── Library Page ─── */
function renderLibraryPage(skills: Array<{ skillId: string; name: string; kind: string; category: string; description: string }>): string {
  const brains = skills.filter(s => s.kind === "sub_agent");
  const hands = skills.filter(s => s.kind !== "sub_agent");
  const card = (s: typeof skills[0], icon: string) =>
    `<div class="surface-2 rounded-xl p-4 hover:shadow-lg transition group">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2"><span class="text-xl">${icon}</span><span class="font-bold text-sm text-primary">${esc(s.name)}</span></div>
        <div class="hidden group-hover:flex gap-1">
          <a href="/library/${esc(s.skillId)}/edit" class="text-[10px] text-sky-600 hover:underline">編輯</a>
          <button class="text-[10px] text-red-600 hover:underline" onclick="deleteSkill('${esc(s.skillId)}')">刪除</button>
        </div>
      </div>
      <div class="text-[10px] text-muted mb-2">${esc(s.category)}</div>
      <p class="text-xs text-secondary leading-relaxed">${esc((s.description || "").slice(0, 120))}</p>
    </div>`;
  const body = `
  <div class="flex items-center justify-between mb-6">
    <div><h2 class="text-2xl font-bold text-primary">腦手資料庫</h2><p class="text-xs text-muted mt-1">${brains.length} 個腦 · ${hands.length} 個手</p></div>
    <button class="btn-primary px-5 py-2.5 rounded-lg text-sm font-bold" onclick="document.getElementById('upload-modal').classList.remove('hidden')">+ 上傳 Skill</button>
  </div>
  <h3 class="text-sm font-bold text-primary uppercase tracking-wider mb-3">🧠 腦（${brains.length}）</h3>
  <div class="grid grid-cols-3 gap-4 mb-8">${brains.map(s => card(s, "🧠")).join("") || '<div class="col-span-3 text-center text-muted py-4">無腦</div>'}</div>
  <h3 class="text-sm font-bold text-primary uppercase tracking-wider mb-3">✋ 手（${hands.length}）</h3>
  <div class="grid grid-cols-3 gap-4">${hands.map(s => card(s, "✋")).join("") || '<div class="col-span-3 text-center text-muted py-4">無手</div>'}</div>
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
    async function uploadSkill(){const c=document.getElementById("skill-content").value;const r=document.getElementById("upload-result");try{const res=await fetch("/api/library/upload",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content:c})});if(!res.ok)throw new Error("上傳失敗");r.className="text-xs mt-2 text-emerald-600";r.textContent="上傳成功！";setTimeout(()=>location.reload(),1000)}catch(e){r.className="text-xs mt-2 text-red-600";r.textContent=e.message}r.classList.remove("hidden")}
    async function deleteSkill(id){if(!confirm("確定刪除？"))return;await fetch("/api/library/"+id,{method:"DELETE"});location.reload()}
  </script>`;
  return renderPageShell({ title: "腦手資料庫 · V2", active: "dashboard", subtitle: "腦手資料庫", body });
}

/* ─── Library Edit Page ─── */
function renderEditPage(skill: { skillId: string; name: string; kind: string; description: string; blocks: Array<{ systemPrompt: string }> }): string {
  const prompt = skill.blocks[0]?.systemPrompt ?? "";
  const body = `
  <div class="max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-4">
      <div><a href="/library" class="text-xs text-muted hover:text-primary">&larr; 返回</a>
      <h2 class="text-xl font-bold text-primary mt-1">${esc(skill.name)}</h2></div>
      <span class="text-xs text-muted">${esc(skill.kind)}</span>
    </div>
    <textarea id="edit-content" class="input-field w-full rounded-lg p-4 text-xs font-mono" rows="30">${esc(prompt)}</textarea>
    <div class="flex justify-end gap-2 mt-3">
      <a href="/library" class="surface-1 px-4 py-2 rounded-lg text-xs font-semibold">取消</a>
      <button class="btn-primary px-6 py-2 rounded-lg text-xs font-bold" onclick="saveSkill()">儲存</button>
    </div>
  </div>
  <script>
    async function saveSkill(){const content=document.getElementById("edit-content").value;const res=await fetch("/api/library/${esc(skill.skillId)}",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({content})});if(res.ok){alert("已儲存");location.href="/library"}else{alert("儲存失敗")}}
  </script>`;
  return renderPageShell({ title: "編輯 " + skill.name + " · V2", active: "dashboard", subtitle: "編輯 Skill", body });
}

/* ─── Brands Page ─── */
function renderBrandsPage(clients: Array<{ clientId: string; name: string; industry: string; createdAt: string }>): string {
  const rows = clients.map(c =>
    `<tr class="hover:bg-slate-50 dark:hover:bg-white/[.03]"><td class="px-4 py-3 font-bold text-primary">${esc(c.name)}</td><td class="px-4 py-3 text-xs text-muted">${esc(c.industry)}</td><td class="px-4 py-3 text-xs text-muted">${esc(c.createdAt.slice(0, 10))}</td><td class="px-4 py-3 text-xs"><a href="/brands/${esc(c.clientId)}" class="text-sky-600 hover:underline">管理</a></td></tr>`
  ).join("");
  const body = `
  <div class="flex items-center justify-between mb-6"><div><h2 class="text-2xl font-bold text-primary">品牌管理</h2><p class="text-xs text-muted mt-1">${clients.length} 個品牌</p></div>
  <button class="btn-primary px-5 py-2.5 rounded-lg text-sm font-bold" onclick="document.getElementById('add-modal').classList.remove('hidden')">+ 新增品牌</button></div>
  <section class="surface-2 rounded-2xl overflow-hidden"><table class="w-full text-sm"><thead class="text-xs text-muted uppercase tracking-wider border-b border-slate-200 dark:border-slate-800"><tr><th class="text-left px-4 py-3">品牌</th><th class="text-left px-4 py-3">產業</th><th class="text-left px-4 py-3">建立</th><th class="px-4 py-3"></th></tr></thead>
  <tbody class="divide-y divide-slate-200 dark:divide-slate-800/60">${rows || '<tr><td colspan="4" class="text-center py-8 text-muted">尚無品牌</td></tr>'}</tbody></table></section>
  <div id="add-modal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick="if(event.target===this)this.classList.add('hidden')">
    <div class="surface-2 rounded-2xl p-6 w-full max-w-md">
      <h3 class="text-lg font-bold text-primary mb-3">新增品牌</h3>
      <input id="brand-name" class="input-field w-full rounded-lg px-3 py-2 text-sm mb-2" placeholder="品牌名稱" />
      <input id="brand-industry" class="input-field w-full rounded-lg px-3 py-2 text-sm mb-2" placeholder="產業（如：美妝、餐飲）" />
      <input id="brand-email" class="input-field w-full rounded-lg px-3 py-2 text-sm mb-3" placeholder="聯絡信箱" />
      <div class="flex justify-end gap-2">
        <button class="surface-1 px-4 py-2 rounded-lg text-xs font-semibold" onclick="this.closest('#add-modal').classList.add('hidden')">取消</button>
        <button class="btn-primary px-4 py-2 rounded-lg text-xs font-bold" onclick="addBrand()">建立</button>
      </div>
    </div>
  </div>
  <script>
    async function addBrand(){const n=document.getElementById("brand-name").value;const i=document.getElementById("brand-industry").value;const e=document.getElementById("brand-email").value;if(!n)return alert("請填品牌名稱");const res=await fetch("/api/brands",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:n,industry:i,contactEmail:e})});if(res.ok){location.reload()}else{alert("建立失敗")}}
  </script>`;
  return renderPageShell({ title: "品牌管理 · V2", active: "database", subtitle: "品牌管理", body });
}

/* ─── Brand Detail Page ─── */
function renderBrandDetail(client: { clientId: string; name: string; industry: string }, outputs: Array<{ outputId: string; title: string; type: string; createdAt: string; contentBody: string }>): string {
  const outputCards = outputs.slice(0, 20).map(o =>
    `<div class="surface-1 rounded-lg p-3 mb-2"><div class="flex justify-between"><span class="font-bold text-xs text-primary">${esc(o.title)}</span><span class="text-[10px] text-muted">${esc(o.createdAt.slice(0, 10))}</span></div><p class="text-xs text-secondary mt-1">${esc(o.contentBody.slice(0, 150))}...</p></div>`
  ).join("");
  const body = `
  <a href="/brands" class="text-xs text-muted hover:text-primary">&larr; 返回品牌列表</a>
  <div class="flex items-center gap-3 mt-2 mb-6"><h2 class="text-2xl font-bold text-primary">${esc(client.name)}</h2><span class="text-xs text-muted">${esc(client.industry)}</span></div>
  <h3 class="text-sm font-bold text-primary uppercase tracking-wider mb-3">產出歷史（${outputs.length}）</h3>
  ${outputCards || '<div class="text-center text-muted py-8">尚無產出</div>'}`;
  return renderPageShell({ title: client.name + " · V2", active: "database", subtitle: client.name, body });
}

/* ─── Workflows Page ─── */
function renderWorkflowsPage(workflows: Array<{ workflowId: string; name: string; nodeCount: number; version: number }>): string {
  const rows = workflows.map(w =>
    `<tr class="hover:bg-slate-50 dark:hover:bg-white/[.03]"><td class="px-4 py-3"><a href="/workflows/${esc(w.workflowId)}" class="font-bold text-sky-600 hover:underline">${esc(w.name)}</a></td><td class="px-4 py-3 text-xs text-center">${w.nodeCount}</td><td class="px-4 py-3 text-xs">v${w.version}</td></tr>`
  ).join("");
  const body = `
  <div class="flex items-center justify-between mb-6"><div><h2 class="text-2xl font-bold text-primary">工作流</h2><p class="text-xs text-muted mt-1">腦討論 → 手執行 → 腦 check → 交付</p></div>
  <a href="/workflows/new" class="btn-primary px-5 py-2.5 rounded-lg text-sm font-bold">+ 新增工作流</a></div>
  <section class="surface-2 rounded-2xl overflow-hidden"><table class="w-full text-sm"><thead class="text-xs text-muted uppercase tracking-wider border-b border-slate-200 dark:border-slate-800"><tr><th class="text-left px-4 py-3">名稱</th><th class="text-center px-4 py-3">節點</th><th class="text-left px-4 py-3">版本</th></tr></thead>
  <tbody class="divide-y divide-slate-200 dark:divide-slate-800/60">${rows || '<tr><td colspan="3" class="text-center py-8 text-muted">尚無工作流</td></tr>'}</tbody></table></section>`;
  return renderPageShell({ title: "工作流 · V2", active: "workflows", subtitle: "工作流", body });
}

/* ─── Workflow Builder Page ─── */
function renderWorkflowBuilder(
  wfId: string | null, wfName: string, nodesJson: string, edgesJson: string,
  skills: Array<{ skillId: string; name: string; kind: string }>,
  clients: Array<{ clientId: string; name: string }>
): string {
  const brainSkills = skills.filter(s => s.kind === "sub_agent");
  const handSkills = skills.filter(s => s.kind !== "sub_agent");
  const brainItems = brainSkills.map(s => `<div class="node-item surface-1 rounded-lg p-2 mb-1 cursor-pointer text-xs hover:border-sky-400 border border-transparent transition" onclick="addNode('brain','${esc(s.skillId)}','🧠 ${esc(s.name)}')">🧠 ${esc(s.name)}</div>`).join("");
  const handItems = handSkills.map(s => `<div class="node-item surface-1 rounded-lg p-2 mb-1 cursor-pointer text-xs hover:border-emerald-400 border border-transparent transition" onclick="addNode('skill','${esc(s.skillId)}','✋ ${esc(s.name)}')">✋ ${esc(s.name)}</div>`).join("");
  const clientOpts = clients.map(c => `<option value="${esc(c.clientId)}">${esc(c.name)}</option>`).join("");

  const body = `
  <style>.wf-layout{display:grid;grid-template-columns:200px 1fr 240px;gap:0;height:calc(100vh - 140px)}.wf-panel{overflow-y:auto;border-right:1px solid #e2e8f0;padding:12px}.wf-panel-r{overflow-y:auto;border-left:1px solid #e2e8f0;padding:12px}.dark .wf-panel,.dark .wf-panel-r{border-color:rgba(255,255,255,.08)}.wf-canvas{background:#f8fafc;position:relative;overflow:auto;min-height:100%}.dark .wf-canvas{background:#0f172a}.wf-node{position:absolute;min-width:150px;padding:10px 14px;border-radius:10px;font-size:12px;font-weight:600;cursor:move;border:2px solid;user-select:none}.wf-node.brain{background:#e0f2fe;border-color:#0ea5e9;color:#0c4a6e}.wf-node.skill{background:#ecfdf5;border-color:#10b981;color:#064e3b}.wf-node.selected{box-shadow:0 0 0 3px rgba(14,165,233,.4)}</style>
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-3"><a href="/workflows" class="text-xs text-muted hover:text-primary">&larr; 返回</a>
    <input id="wf-name" type="text" value="${esc(wfName)}" placeholder="工作流名稱" class="input-field px-3 py-1.5 rounded-lg text-sm font-bold w-64" /></div>
    <div class="flex gap-2">
      <button class="surface-1 px-4 py-2 rounded-lg text-xs font-semibold" onclick="saveWf()">💾 儲存</button>
      <button class="btn-primary px-4 py-2 rounded-lg text-xs font-bold" onclick="runWf()">▶ 執行</button>
    </div>
  </div>
  <div class="wf-layout rounded-2xl overflow-hidden surface-2">
    <div class="wf-panel">
      <div class="text-xs font-bold text-primary uppercase mb-2">節點庫</div>
      <div class="text-[10px] text-muted uppercase mb-1">腦 <span class="text-emerald-600">按需調用</span></div>
      ${brainItems || '<div class="text-[10px] text-muted">無腦 Skill</div>'}
      <div class="text-[10px] text-muted uppercase mb-1 mt-3">手 <span class="text-amber-600">~$0.005</span></div>
      ${handItems || '<div class="text-[10px] text-muted">無手 Skill</div>'}
    </div>
    <div class="wf-canvas" id="canvas">
      <svg id="edges-svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none"></svg>
    </div>
    <div class="wf-panel-r" id="config-panel">
      <div class="text-xs font-bold text-primary uppercase mb-2">設定</div>
      <div id="cfg-empty" class="text-xs text-muted py-4 text-center">點擊節點查看設定</div>
      <div id="cfg-content" class="hidden">
        <label class="text-[10px] text-muted uppercase">標籤</label>
        <input id="cfg-label" class="input-field w-full px-2 py-1 rounded text-xs mt-1 mb-2" onchange="updateLabel()" />
        <div id="cfg-brain-sec" class="hidden">
          <label class="text-[10px] text-muted uppercase">客戶</label>
          <select id="cfg-client" class="input-field w-full px-2 py-1 rounded text-xs mt-1 mb-2">${clientOpts}</select>
        </div>
        <button class="w-full mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 surface-1" onclick="deleteNode()">刪除節點</button>
      </div>
    </div>
  </div>
  <div id="run-modal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick="if(event.target===this)this.classList.add('hidden')">
    <div class="surface-2 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
      <h3 class="text-lg font-bold text-primary mb-3">執行結果</h3>
      <div id="run-steps"></div>
      <div class="flex justify-end mt-4"><button class="surface-1 px-4 py-2 rounded-lg text-xs font-semibold" onclick="document.getElementById('run-modal').classList.add('hidden')">關閉</button></div>
    </div>
  </div>
  <script>
  const WFID=${wfId ? `"${esc(wfId)}"` : "null"};
  let nodes=${nodesJson},edges=${edgesJson},selectedId=null,nextNum=nodes.length+1;
  const canvas=document.getElementById("canvas"),edgesSvg=document.getElementById("edges-svg");

  function addNode(type,skillId,label){
    const id="n"+(nextNum++);
    const cx=canvas.scrollLeft+80+(nodes.length%3)*180;
    const cy=canvas.scrollTop+40+Math.floor(nodes.length/3)*80;
    const n={nodeId:id,type,skillId:skillId||undefined,brainConfig:type==="brain"?{brainType:"skill",clientId:"",prompt:""}:undefined,label,position:{x:cx,y:cy},config:{}};
    nodes.push(n);renderNodes();selectNode(id);
  }
  function renderNodes(){
    canvas.querySelectorAll(".wf-node").forEach(e=>e.remove());
    nodes.forEach(n=>{
      const d=document.createElement("div");
      d.className="wf-node "+(n.type==="brain"?"brain":"skill")+(selectedId===n.nodeId?" selected":"");
      d.style.left=n.position.x+"px";d.style.top=n.position.y+"px";
      d.textContent=n.label;d.dataset.id=n.nodeId;
      d.onmousedown=startDrag;d.onclick=()=>selectNode(n.nodeId);
      canvas.appendChild(d);
    });renderEdges();
  }
  function renderEdges(){
    edgesSvg.innerHTML="";
    edges.forEach(e=>{
      const f=nodes.find(n=>n.nodeId===e.from),t=nodes.find(n=>n.nodeId===e.to);
      if(!f||!t)return;
      const x1=f.position.x+150,y1=f.position.y+20,x2=t.position.x,y2=t.position.y+20;
      const dx=Math.abs(x2-x1)*.4;
      const path=document.createElementNS("http://www.w3.org/2000/svg","path");
      path.setAttribute("d","M"+x1+","+y1+" C"+(x1+dx)+","+y1+" "+(x2-dx)+","+y2+" "+x2+","+y2);
      path.setAttribute("stroke",f.type==="brain"&&t.type==="brain"?"#8b5cf6":"#94a3b8");
      path.setAttribute("stroke-width","2");path.setAttribute("fill","none");
      path.setAttribute("stroke-dasharray",f.type==="brain"&&t.type==="brain"?"6,4":"none");
      edgesSvg.appendChild(path);
    });
  }
  let dragId=null,dragOff={x:0,y:0};
  function startDrag(e){
    dragId=e.target.dataset.id;
    e.stopPropagation();
  }
  canvas.onmousemove=e=>{
    if(!dragId)return;const n=nodes.find(x=>x.nodeId===dragId);if(!n)return;
    const r=canvas.getBoundingClientRect();
    n.position.x=Math.max(0,e.clientX-r.left+canvas.scrollLeft);
    n.position.y=Math.max(0,e.clientY-r.top+canvas.scrollTop);
    renderNodes();
  };
  canvas.onmouseup=()=>{dragId=null};
  // 連線：shift+click 起點，再 shift+click 終點
  let edgeFrom=null;
  canvas.onclick=e=>{
    if(!e.shiftKey){edgeFrom=null;if(!e.target.closest(".wf-node"))selectNode(null);return}
    const nd=e.target.closest(".wf-node");if(!nd)return;
    if(!edgeFrom){edgeFrom=nd.dataset.id;nd.style.outline="3px solid #f59e0b";return}
    const to=nd.dataset.id;
    if(to!==edgeFrom&&!edges.some(ed=>ed.from===edgeFrom&&ed.to===to)){
      edges.push({edgeId:"e"+Date.now(),from:edgeFrom,to});
    }
    edgeFrom=null;renderNodes();
  };
  function selectNode(id){
    selectedId=id;renderNodes();
    const cfg=document.getElementById("cfg-content"),empty=document.getElementById("cfg-empty");
    if(!id){cfg.classList.add("hidden");empty.classList.remove("hidden");return}
    empty.classList.add("hidden");cfg.classList.remove("hidden");
    const n=nodes.find(x=>x.nodeId===id);if(!n)return;
    document.getElementById("cfg-label").value=n.label;
    document.getElementById("cfg-brain-sec").classList.toggle("hidden",n.type!=="brain");
  }
  function updateLabel(){const n=nodes.find(x=>x.nodeId===selectedId);if(n){n.label=document.getElementById("cfg-label").value;renderNodes()}}
  function deleteNode(){if(!selectedId)return;nodes=nodes.filter(n=>n.nodeId!==selectedId);edges=edges.filter(e=>e.from!==selectedId&&e.to!==selectedId);selectNode(null);renderNodes()}
  async function saveWf(){
    const name=document.getElementById("wf-name").value.trim();if(!name)return alert("請輸入名稱");
    const method=WFID?"PUT":"POST",url=WFID?"/api/workflows/"+WFID:"/api/workflows";
    const res=await fetch(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify({name,nodes,edges})});
    const d=await res.json();if(!res.ok)return alert(d?.error?.message||"儲存失敗");
    if(!WFID&&d.workflowId)location.href="/workflows/"+d.workflowId;
    else alert("已儲存");
  }
  async function runWf(){
    if(!WFID)return alert("請先儲存");
    const btn=event.target;btn.disabled=true;btn.textContent="執行中...";
    try{
      const res=await fetch("/api/workflows/"+WFID+"/run",{method:"POST",headers:{"content-type":"application/json","x-confirm-cost":"true"}});
      const d=await res.json();if(!res.ok)throw new Error(d?.error?.message||"失敗");
      const div=document.getElementById("run-steps");
      div.innerHTML=d.steps?.map(s=>{
        const icon=s.type==="brain"?"🧠":"✋",cost=s.costEstimatedUsd>0?" · $"+s.costEstimatedUsd.toFixed(4):" · 免費";
        return '<div class="surface-1 rounded-lg p-3 mb-2"><div class="flex justify-between"><span class="font-bold text-xs">'+icon+" "+s.nodeId+cost+'</span><span class="text-xs '+(s.error?"text-red-600":"text-emerald-600")+'">'+(s.error?"失敗":"完成")+'</span></div><div class="text-xs text-secondary whitespace-pre-wrap mt-1">'+(s.content||s.error||"").slice(0,300)+"</div></div>"
      }).join("")||"";
      document.getElementById("run-modal").classList.remove("hidden");
    }catch(e){alert(e.message)}
    finally{btn.disabled=false;btn.textContent="▶ 執行"}
  }
  renderNodes();
  </script>`;
  return renderPageShell({ title: (wfId ? "編輯" : "新增") + "工作流 · V2", active: "workflows", subtitle: "工作流建構器", body });
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

  function cookieAuth(req: IncomingMessage): void {
    const match = req.headers.cookie?.match(/sy_token=([^;]+)/);
    if (match) authenticateRequest({ ...req, headers: { ...req.headers, authorization: `Bearer ${decodeURIComponent(match[1]!)}` } } as IncomingMessage, tokenRegistry);
  }
  function getActor(req: IncomingMessage): Actor | null {
    return (req as IncomingMessage & { context?: { actor: Actor | null } }).context?.actor ?? null;
  }
  function isProtected(p: string): boolean {
    return p === "/" || p === "/library" || p === "/workflows" || p === "/brands" || p.startsWith("/workflows/") || p.startsWith("/brands/") || p.startsWith("/library/");
  }

  const server = createServer(async (request, response) => {
    attachRequestContext(request);
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

    if (url.pathname === "/health") { sendJson(response, 200, { status: "ok", appEnv: process.env.APP_ENV ?? "development", uptimeSeconds: Math.floor(process.uptime()) }); return; }

    // Login
    if (url.pathname === "/login" && request.method === "GET") {
      sendHtml(response, renderPageShell({ title: "登入", active: "dashboard", subtitle: "登入",
        body: `<div class="max-w-sm mx-auto mt-20"><h2 class="text-xl font-bold text-primary mb-4 text-center">登入</h2><form onsubmit="event.preventDefault();fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:document.getElementById('t').value})}).then(r=>r.json()).then(d=>{if(d.alias){document.cookie='sy_token='+document.getElementById('t').value+';path=/';location.href='/'}else{alert('Token 無效')}})"><input id="t" type="password" class="input-field w-full rounded-lg px-3 py-3 text-sm mb-3" placeholder="Token" /><button class="btn-primary w-full py-3 rounded-lg text-sm font-bold">登入</button></form></div>`
      }));
      return;
    }
    if (url.pathname === "/api/login" && request.method === "POST") {
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const actor = authenticateRequest({ ...request, headers: { ...request.headers, authorization: `Bearer ${body.token}` } } as IncomingMessage, tokenRegistry);
      if (actor) sendJson(response, 200, { alias: actor.alias, role: actor.role });
      else sendErrorResponse(response, 401, "INVALID_TOKEN", "Token 無效");
      return;
    }

    // Auth guard
    if (isProtected(url.pathname)) {
      cookieAuth(request);
      if (!getActor(request)) { response.writeHead(302, { Location: "/login" }); response.end(); return; }
    }

    // ── SSR Pages ──
    if (url.pathname === "/" || url.pathname === "/library") {
      sendHtml(response, renderLibraryPage(repositories.skills.list().map(s => ({ skillId: s.skillId, name: s.name, kind: s.kind, category: s.category, description: s.description }))));
      return;
    }
    const editMatch = url.pathname.match(/^\/library\/([^/]+)\/edit$/);
    if (editMatch) {
      const skill = repositories.skills.findById(decodeURIComponent(editMatch[1]!));
      if (!skill) { sendErrorResponse(response, 404, "NOT_FOUND", "Skill 不存在"); return; }
      sendHtml(response, renderEditPage(skill));
      return;
    }
    if (url.pathname === "/brands") {
      sendHtml(response, renderBrandsPage(repositories.clients.list().map(c => ({ clientId: c.clientId, name: c.name, industry: c.industry, createdAt: c.createdAt }))));
      return;
    }
    const brandDetailMatch = url.pathname.match(/^\/brands\/([^/]+)$/);
    if (brandDetailMatch && brandDetailMatch[1] !== "new") {
      const clientId = decodeURIComponent(brandDetailMatch[1]!);
      const client = repositories.clients.getById(clientId);
      if (!client) { sendErrorResponse(response, 404, "NOT_FOUND", "品牌不存在"); return; }
      const outputs = repositories.outputs.listByClient(clientId);
      sendHtml(response, renderBrandDetail({ clientId: client.clientId, name: client.name, industry: client.industry }, outputs));
      return;
    }
    if (url.pathname === "/workflows") {
      sendHtml(response, renderWorkflowsPage(repositories.workflows.list().map(w => ({ workflowId: w.workflowId, name: w.name, nodeCount: w.nodes.length, version: w.version }))));
      return;
    }
    const wfMatch = url.pathname.match(/^\/workflows\/([^/]+)$/);
    if (wfMatch) {
      const wfId = wfMatch[1]!;
      const wf = wfId === "new" ? null : repositories.workflows.getById(wfId);
      const skills = repositories.skills.list().map(s => ({ skillId: s.skillId, name: s.name, kind: s.kind }));
      const clients = repositories.clients.list().map(c => ({ clientId: c.clientId, name: c.name }));
      sendHtml(response, renderWorkflowBuilder(
        wf ? wfId : null, wf?.name ?? "", JSON.stringify(wf?.nodes ?? []), JSON.stringify(wf?.edges ?? []), skills, clients
      ));
      return;
    }

    // ── API ──
    if (url.pathname === "/api/library" && request.method === "GET") { if (!requireViewer(request, response)) return; sendJson(response, 200, { ok: true, skills: repositories.skills.list() }); return; }

    if (url.pathname === "/api/library/upload" && request.method === "POST") {
      if (!requireOperator(request, response)) return;
      try {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const content = typeof body.content === "string" ? body.content : "";
        if (!content.trim()) { sendErrorResponse(response, 400, "EMPTY", "內容不能為空"); return; }
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const skillId = nameMatch ? nameMatch[1]!.trim() : randomUUID();
        const layerMatch = content.match(/^layer:\s*(.+)$/m);
        const kind = layerMatch && layerMatch[1]!.trim() === "brain" ? "sub_agent" as const : "workflow" as const;
        const descMatch = content.match(/^description:\s*\|?\s*\n?([\s\S]*?)(?=\n---|\n#|$)/m);
        repositories.skills.save({ skillId, name: skillId, kind, category: "content_writing", version: "1.0", description: descMatch ? descMatch[1]!.trim().slice(0, 200) : content.slice(0, 200), inputSchema: {}, outputSchema: {}, blocks: [{ blockId: "main", name: skillId, type: "skill", systemPrompt: content }], isShared: true });
        sendJson(response, 201, { ok: true, skillId });
      } catch (error) { sendErrorResponse(response, 400, "UPLOAD_FAILED", error instanceof Error ? error.message : "上傳失敗"); }
      return;
    }

    const skillApiMatch = url.pathname.match(/^\/api\/library\/([^/]+)$/);
    if (skillApiMatch && request.method === "PUT") {
      if (!requireOperator(request, response)) return;
      const skillId = decodeURIComponent(skillApiMatch[1]!);
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const content = typeof body.content === "string" ? body.content : "";
      const existing = repositories.skills.findById(skillId);
      if (!existing) { sendErrorResponse(response, 404, "NOT_FOUND", "Skill 不存在"); return; }
      repositories.skills.save({ ...existing, blocks: [{ blockId: "main", name: existing.name, type: "skill", systemPrompt: content }] });
      sendJson(response, 200, { ok: true });
      return;
    }
    if (skillApiMatch && request.method === "DELETE") {
      if (!requireOperator(request, response)) return;
      // SQLite 沒有 delete skill 方法，標記 description 為 [DELETED]
      const skillId = decodeURIComponent(skillApiMatch[1]!);
      const existing = repositories.skills.findById(skillId);
      if (existing) { repositories.skills.save({ ...existing, description: "[DELETED] " + existing.description }); }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/brands" && request.method === "GET") { if (!requireViewer(request, response)) return; sendJson(response, 200, { ok: true, clients: repositories.clients.list() }); return; }
    if (url.pathname === "/api/brands" && request.method === "POST") {
      if (!requireOperator(request, response)) return;
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const clientId = "client_" + randomUUID().slice(0, 10);
      repositories.clients.create({ clientId, name: typeof body.name === "string" ? body.name : "未命名", industry: typeof body.industry === "string" ? body.industry : "general", status: "active", subscription: { tier: "basic", agentLevel: 1, satisfaction: 0, monthlyFee: 0 }, contactEmail: typeof body.contactEmail === "string" ? body.contactEmail : "", dataroomPath: "", createdAt: new Date().toISOString(), googleFormUrl: null, googleSheetId: null } as any);
      sendJson(response, 201, { ok: true, clientId });
      return;
    }

    if (url.pathname === "/api/workflows" && request.method === "GET") { if (!requireViewer(request, response)) return; sendJson(response, 200, { ok: true, workflows: repositories.workflows.list() }); return; }
    if (url.pathname === "/api/workflows" && request.method === "POST") {
      if (!requireOperator(request, response)) return;
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const workflowId = randomUUID(); const now = new Date().toISOString();
      repositories.workflows.create({ workflowId, name: typeof body.name === "string" ? body.name : "未命名", clientId: typeof body.clientId === "string" ? body.clientId : "", nodes: Array.isArray(body.nodes) ? body.nodes as any[] : [], edges: Array.isArray(body.edges) ? body.edges as any[] : [], createdBy: request.context.actor.alias, version: 1, createdAt: now, updatedAt: now });
      sendJson(response, 201, { ok: true, workflowId });
      return;
    }
    const wfApiMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)$/);
    if (wfApiMatch && request.method === "PUT") {
      if (!requireOperator(request, response)) return;
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      repositories.workflows.update(wfApiMatch[1]!, { name: typeof body.name === "string" ? body.name : undefined, nodes: Array.isArray(body.nodes) ? body.nodes as any : undefined, edges: Array.isArray(body.edges) ? body.edges as any : undefined } as any);
      sendJson(response, 200, { ok: true });
      return;
    }
    const wfRunMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/run$/);
    if (wfRunMatch && request.method === "POST") {
      if (!requireOperator(request, response) || !requireCostConfirmation(request, response)) return;
      const wf = repositories.workflows.getById(wfRunMatch[1]!);
      if (!wf) { sendErrorResponse(response, 404, "NOT_FOUND", "找不到工作流"); return; }
      try { const { executeWorkflow } = await import("./runtime/workflow-engine.js"); const result = await executeWorkflow(wf, repositories); sendJson(response, 200, { ok: true, ...result }); }
      catch (error) { sendErrorResponse(response, 500, "EXEC_FAILED", error instanceof Error ? error.message : "執行失敗"); }
      return;
    }

    if (url.pathname === "/api/connectors" && request.method === "GET") {
      if (!requireViewer(request, response)) return;
      import("./connectors/index.js").then(m => sendJson(response, 200, { ok: true, connectors: m.listConnectors().map(c => ({ id: c.id, name: c.name, available: c.isAvailable() })) })).catch(() => sendJson(response, 200, { ok: true, connectors: [] }));
      return;
    }

    sendErrorResponse(response, 404, "NOT_FOUND", `找不到 ${url.pathname}`);
  });

  return new Promise(resolve => { server.listen(Number(port), host, () => { console.log(`Status server listening on http://${host}:${port}`); resolve(server); }); });
}
