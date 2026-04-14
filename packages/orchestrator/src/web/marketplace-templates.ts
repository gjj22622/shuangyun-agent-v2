/**
 * Skill Marketplace SSR template。
 */

import { escapeHtml, renderPageShell } from "./shared-templates.js";

export type MarketplaceSkillCard = {
  skillId: string;
  name: string;
  category: string;
  description: string;
  installCount: number;
  version: string;
  publisherAlias: string;
  status: string;
  installed: boolean;
};

export type MarketplacePageInput = {
  skills: MarketplaceSkillCard[];
  viewerAlias: string;
  viewerRole: string;
};

const CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "content_writing", label: "📝 內容" },
  { key: "image_generation", label: "🎨 視覺" },
  { key: "video_script", label: "🎬 影片" },
  { key: "marketing_plan", label: "📋 企劃" },
  { key: "ads_strategy", label: "🎯 廣告" },
  { key: "weekly_report", label: "📊 報告" },
  { key: "compliance_check", label: "⚖️ 合規" },
  { key: "brand_voice", label: "🎤 品牌" },
  { key: "schedule_query", label: "📅 排程" }
];

export function renderMarketplace(input: MarketplacePageInput): string {
  const categoryTabs = CATEGORIES.map(c =>
    `<button class="px-3 py-1.5 rounded-lg text-xs font-semibold transition surface-1 hover:border-sky-400" data-cat="${c.key}" onclick="filterCategory('${c.key}')">${c.label}</button>`
  ).join("");

  const skillCards = input.skills.map(skill => {
    const desc = skill.description.length > 80 ? skill.description.slice(0, 80) + "..." : skill.description;
    return `<article class="surface-2 rounded-xl p-5 hover:shadow-lg transition" data-category="${escapeHtml(skill.category)}">
  <div class="flex items-center justify-between mb-3">
    <div class="font-bold text-sm text-primary">${escapeHtml(skill.name)}</div>
    <span class="text-[10px] text-muted mono">${escapeHtml(skill.category)}</span>
  </div>
  <p class="text-xs text-secondary mb-3 leading-relaxed">${escapeHtml(desc)}</p>
  <div class="flex items-center justify-between">
    <div class="text-[11px] text-muted">v${escapeHtml(skill.version)} · ${escapeHtml(skill.publisherAlias)}</div>
    ${skill.installed
      ? '<span class="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">已安裝 ✓</span>'
      : `<button class="px-3 py-1 rounded-lg text-xs font-bold btn-primary transition" onclick="installSkill('${escapeHtml(skill.skillId)}',this)">安裝</button>`}
  </div>
</article>`;
  }).join("");

  const body = `
  <div class="flex items-center justify-between mb-4">
    <div>
      <h2 class="text-2xl font-bold text-primary">Skill 市集</h2>
      <p class="text-xs text-muted mt-1">${input.skills.length} 個 Skill 可用</p>
    </div>
    <div class="flex gap-2">
      <button class="surface-1 px-4 py-2 rounded-lg text-xs font-semibold text-secondary hover:text-primary transition" onclick="document.getElementById('import-modal').classList.remove('hidden')">📥 匯入 JSON</button>
      ${input.viewerRole !== "viewer" ? '<button class="btn-primary px-4 py-2 rounded-lg text-xs font-bold transition" onclick="document.getElementById(\'publish-modal\').classList.remove(\'hidden\')">📤 發佈 Skill</button>' : ""}
    </div>
  </div>

  <div class="flex flex-wrap gap-2 mb-6">${categoryTabs}</div>

  <div class="grid grid-cols-3 gap-4" id="skill-grid">
    ${skillCards || '<div class="col-span-3 text-center text-muted py-8">目前沒有 Skill</div>'}
  </div>

  <!-- 匯入 JSON modal -->
  <div id="import-modal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick="if(event.target===this)this.classList.add('hidden')">
    <div class="surface-2 rounded-2xl p-6 w-full max-w-lg">
      <h3 class="text-lg font-bold text-primary mb-3">匯入 Skill JSON</h3>
      <textarea id="import-json" class="input-field w-full rounded-lg p-3 text-xs" rows="10" placeholder='貼上 SkillManifest JSON...'></textarea>
      <div class="flex justify-end gap-2 mt-3">
        <button class="surface-1 px-4 py-2 rounded-lg text-xs font-semibold" onclick="this.closest('#import-modal').classList.add('hidden')">取消</button>
        <button class="btn-primary px-4 py-2 rounded-lg text-xs font-bold" onclick="importJson()">匯入</button>
      </div>
      <div id="import-result" class="text-xs mt-2 hidden"></div>
    </div>
  </div>

  <script>
    function filterCategory(cat) {
      document.querySelectorAll('#skill-grid article').forEach(card => {
        card.style.display = (cat === 'all' || card.dataset.category === cat) ? '' : 'none';
      });
    }
    async function installSkill(skillId, btn) {
      btn.disabled = true; btn.textContent = '安裝中...';
      try {
        const res = await fetch('/api/marketplace/skills/' + skillId + '/install', { method: 'POST', headers: { 'x-confirm-cost': 'true' } });
        if (!res.ok) throw new Error('安裝失敗');
        btn.textContent = '已安裝 ✓'; btn.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
      } catch(e) { btn.textContent = '失敗'; btn.disabled = false; }
    }
    async function importJson() {
      const json = document.getElementById('import-json').value;
      const result = document.getElementById('import-result');
      try {
        const parsed = JSON.parse(json);
        const res = await fetch('/api/marketplace/skills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed) });
        if (!res.ok) throw new Error('匯入失敗');
        result.className = 'text-xs mt-2 text-emerald-600'; result.textContent = '匯入成功！重新整理頁面即可看到。';
      } catch(e) { result.className = 'text-xs mt-2 text-red-600'; result.textContent = e.message; }
      result.classList.remove('hidden');
    }
  </script>`;

  return renderPageShell({
    title: "Skill 市集 · 双云 AI 行銷部",
    active: "marketplace",
    subtitle: "Skill 市集",
    body
  });
}
