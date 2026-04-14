/**
 * Admin 後台 SSR templates（admin only）。
 * /admin/brains — 三腦設計總覽
 * /admin/skills — Skill 進階管理
 */

import type { BrandBrain, Client, MasterCase, Playbook } from "@shuangyun/shared-types";
import { escapeHtml, renderPageShell } from "./shared-templates.js";

export type AdminBrainsPageInput = {
  strategyDirectives: string[];
  masterCases: MasterCase[];
  playbooks: Playbook[];
  brandBrains: Array<{ client: Client; brain: BrandBrain }>;
};

export function renderAdminBrains(input: AdminBrainsPageInput): string {
  const directivesList = input.strategyDirectives.map((d, i) =>
    `<div class="surface-sunken rounded-lg p-2 text-xs text-secondary">${i + 1}. ${escapeHtml(d)}</div>`
  ).join("");

  const caseCards = input.masterCases.slice(0, 10).map(c =>
    `<div class="surface-1 rounded-lg p-3">
      <div class="font-bold text-xs text-primary">${escapeHtml(c.caseId)}</div>
      <div class="text-[11px] text-muted mt-1">${escapeHtml(c.industry)} · ${escapeHtml(c.channel)}</div>
      <div class="text-xs text-secondary mt-1">${escapeHtml(c.summary.slice(0, 100))}</div>
    </div>`
  ).join("");

  const brainRows = input.brandBrains.map(({ client, brain }) =>
    `<tr class="hover:bg-slate-50 dark:hover:bg-white/[.03]">
      <td class="px-4 py-3 font-bold text-primary">${escapeHtml(client.name)}</td>
      <td class="px-4 py-3 text-xs text-muted">${escapeHtml(client.industry)}</td>
      <td class="px-4 py-3 text-xs">v${brain.version}</td>
      <td class="px-4 py-3 text-xs text-muted">${Object.keys(brain.agents).join(" / ")}</td>
      <td class="px-4 py-3 text-xs text-muted">${brain.strategyNotes.length} 條</td>
    </tr>`
  ).join("");

  const body = `
  <div class="flex items-center justify-between mb-6">
    <div>
      <h2 class="text-2xl font-bold text-primary">管理後台 — 三腦設計</h2>
      <p class="text-xs text-muted mt-1">此頁面僅 admin 可見，團隊看不到腦的內部設計</p>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-6">
    <!-- 双云策略腦 -->
    <section class="zone-shuangyun rounded-2xl p-5">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-3xl">🧠</span>
        <div>
          <div class="font-bold text-primary">双云策略腦</div>
          <div class="text-xs text-muted">${input.strategyDirectives.length} 條 directives</div>
        </div>
      </div>
      <div class="space-y-2">${directivesList || '<div class="text-xs text-muted">無 directives</div>'}</div>
    </section>

    <!-- 師傅腦 -->
    <section class="zone-master rounded-2xl p-5">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-3xl">🎓</span>
        <div>
          <div class="font-bold text-primary">師傅腦</div>
          <div class="text-xs text-muted">${input.masterCases.length} 筆案例 · ${input.playbooks.length} 個劇本</div>
        </div>
      </div>
      <div class="space-y-2">${caseCards || '<div class="text-xs text-muted">無案例</div>'}</div>
    </section>
  </div>

  <!-- 品牌腦列表 -->
  <section class="surface-2 rounded-2xl mt-6 overflow-hidden">
    <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-700/60">
      <h3 class="text-sm font-bold text-primary uppercase tracking-wider">品牌腦列表（${input.brandBrains.length} 個客戶）</h3>
    </div>
    <table class="w-full text-sm">
      <thead class="text-xs text-muted uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
        <tr>
          <th class="text-left px-4 py-3 font-semibold">品牌名稱</th>
          <th class="text-left px-4 py-3 font-semibold">產業</th>
          <th class="text-left px-4 py-3 font-semibold">版本</th>
          <th class="text-left px-4 py-3 font-semibold">4 Agent</th>
          <th class="text-left px-4 py-3 font-semibold">策略筆記</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200 dark:divide-slate-800/60">
        ${brainRows || '<tr><td colspan="5" class="text-center py-6 text-muted">無品牌腦</td></tr>'}
      </tbody>
    </table>
  </section>`;

  return renderPageShell({
    title: "管理後台 — 三腦設計 · 双云 AI 行銷部",
    active: "admin",
    subtitle: "管理後台 · Admin Only",
    body
  });
}
