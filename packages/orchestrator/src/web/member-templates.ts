/**
 * 團隊儀表板 /members + 個人工作史 /members/:alias SSR templates。
 * 視覺基礎來自 04_MVP規劃/previews/members-overview.html + member-detail.html。
 */

import { escapeHtml, renderPageShell } from "./shared-templates.js";

export type MemberOverviewRow = {
  memberId: string;
  alias: string;
  displayName: string;
  role: string;
  status: string;
  today: { usd: number; taskCount: number };
  thisWeek: { usd: number; taskCount: number };
  thisMonth: { usd: number; taskCount: number };
  lastActiveAt: string | null;
  statusHint: string;
  // wallet fields (optional, may not exist until token-incentive is wired)
  tier?: string;
  tierIcon?: string;
  lifetimeEarned?: number;
  monthlyEarn?: number;
  balance?: number;
  dailyCap?: number;
  todayTokenSpend?: number;
};

export type MemberOverviewInput = {
  members: MemberOverviewRow[];
  viewerAlias: string;
  viewerRole: string;
};

function statusPillClass(hint: string): string {
  if (hint === "too_busy") return "status-busy";
  if (hint === "too_quiet") return "status-quiet";
  return "status-normal";
}

function statusLabel(hint: string): string {
  if (hint === "too_busy") return "太忙";
  if (hint === "too_quiet") return "冷凍";
  return "正常";
}

function tierPillClass(tier?: string): string {
  if (tier === "Platinum") return "tier-platinum";
  if (tier === "Gold") return "tier-gold";
  if (tier === "Silver") return "tier-silver";
  return "tier-bronze";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "剛剛";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分鐘前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小時前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

function usagePct(spend: number | undefined, cap: number | undefined): number {
  if (!cap || cap <= 0) return 0;
  return Math.min(100, Math.round(((spend ?? 0) / cap) * 100));
}

function barClass(pct: number): string {
  if (pct >= 80) return "bar-red";
  if (pct >= 50) return "bar-yellow";
  return "bar-green";
}

function avatarGradient(index: number): string {
  const gradients = [
    "from-red-500 to-amber-500",
    "from-sky-500 to-cyan-500",
    "from-red-600 to-rose-500",
    "from-emerald-500 to-teal-500",
    "from-orange-500 to-amber-500",
    "from-sky-600 to-blue-600",
    "from-amber-500 to-yellow-500"
  ];
  return gradients[index % gradients.length] || "from-sky-500 to-cyan-500";
}

export function renderMembersOverview(input: MemberOverviewInput): string {
  const totalMembers = input.members.length;
  const activeCount = input.members.filter(m => m.status === "active").length;
  const todayTotalUsd = input.members.reduce((sum, m) => sum + (m.today?.usd ?? 0), 0);
  const totalMonthEarn = input.members.reduce((sum, m) => sum + (m.monthlyEarn ?? 0), 0);
  const busyCount = input.members.filter(m => m.statusHint === "too_busy").length;
  const quietCount = input.members.filter(m => m.statusHint === "too_quiet").length;
  const normalCount = totalMembers - busyCount - quietCount;

  const rows = input.members.map((m, idx) => {
    const pct = usagePct(m.todayTokenSpend, m.dailyCap);
    const initial = m.displayName.charAt(0);
    const isQuiet = m.statusHint === "too_quiet";

    return `<tr class="${isQuiet ? "opacity-60" : ""} hover:bg-slate-50 dark:hover:bg-white/[.03] transition">
  <td class="px-5 py-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(idx)} flex items-center justify-center font-bold text-white">${escapeHtml(initial)}</div>
      <div><div class="font-bold text-primary">${escapeHtml(m.displayName)}</div><div class="text-xs text-muted">${escapeHtml(m.role)} · ${escapeHtml(m.alias)}</div></div>
    </div>
  </td>
  <td class="px-3"><span class="tier-pill ${tierPillClass(m.tier)}">${escapeHtml(m.tierIcon ?? "🥉")} ${escapeHtml(m.tier ?? "Bronze")}</span></td>
  <td class="px-3">
    <div class="flex items-center justify-between text-xs mb-1"><span class="text-secondary">${m.todayTokenSpend ?? 0} / ${m.dailyCap ?? 5000} 🪙</span><span class="text-${pct >= 80 ? "red" : pct >= 50 ? "amber" : "emerald"}-600 dark:text-${pct >= 80 ? "red" : pct >= 50 ? "amber" : "emerald"}-400">${pct}%</span></div>
    <div class="progress-bar"><span class="${barClass(pct)}" style="width:${pct}%"></span></div>
  </td>
  <td class="px-3 text-right"><div class="font-bold text-emerald-600 dark:text-emerald-300">+${m.monthlyEarn ?? 0}</div><div class="text-[11px] text-muted">lifetime ${m.lifetimeEarned ?? 0}</div></td>
  <td class="px-3 text-right"><div class="font-bold text-sky-600 dark:text-sky-300">${m.thisMonth?.taskCount ?? 0}</div></td>
  <td class="px-3 text-right text-xs text-muted">${relativeTime(m.lastActiveAt)}</td>
  <td class="px-5 text-right"><span class="status-pill ${statusPillClass(m.statusHint)}">${statusLabel(m.statusHint)}</span></td>
</tr>`;
  }).join("");

  const body = `
  <div class="grid grid-cols-5 gap-4">
    <div class="surface-1 p-4 rounded-xl"><div class="text-xs text-secondary uppercase font-semibold">成員總數</div><div class="text-3xl font-bold text-primary mt-1">${totalMembers}</div><div class="text-[11px] text-muted mt-1">${activeCount} active</div></div>
    <div class="surface-1 p-4 rounded-xl"><div class="text-xs text-secondary uppercase font-semibold">今日總用量</div><div class="text-3xl font-bold text-amber-600 dark:text-amber-300 mt-1">$${todayTotalUsd.toFixed(2)}</div></div>
    <div class="surface-1 p-4 rounded-xl"><div class="text-xs text-secondary uppercase font-semibold">今日總任務</div><div class="text-3xl font-bold text-sky-600 dark:text-sky-300 mt-1">${input.members.reduce((s, m) => s + (m.today?.taskCount ?? 0), 0)}</div></div>
    <div class="surface-1 p-4 rounded-xl"><div class="text-xs text-secondary uppercase font-semibold">本月總 earn</div><div class="text-3xl font-bold text-emerald-600 dark:text-emerald-300 mt-1">${totalMonthEarn} 🪙</div></div>
    <div class="surface-1 p-4 rounded-xl"><div class="text-xs text-secondary uppercase font-semibold">狀態</div><div class="mt-2 flex items-center gap-2 text-sm flex-wrap"><span class="status-pill status-normal">${normalCount} 正常</span>${busyCount ? `<span class="status-pill status-busy">${busyCount} 太忙</span>` : ""}${quietCount ? `<span class="status-pill status-quiet">${quietCount} 冷凍</span>` : ""}</div></div>
  </div>

  <section class="surface-2 rounded-2xl overflow-hidden">
    <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-700/60">
      <h2 class="text-sm font-bold text-primary uppercase tracking-wider">團隊成員</h2>
    </div>
    <table class="w-full text-sm">
      <thead class="text-xs text-muted uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
        <tr>
          <th class="text-left px-5 py-3 font-semibold">夥伴</th>
          <th class="text-left px-3 py-3 font-semibold">Tier</th>
          <th class="text-left px-3 py-3 w-48 font-semibold">今日用量</th>
          <th class="text-right px-3 py-3 font-semibold">本月 earn</th>
          <th class="text-right px-3 py-3 font-semibold">任務</th>
          <th class="text-right px-3 py-3 font-semibold">最後活躍</th>
          <th class="text-right px-5 py-3 font-semibold">狀態</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200 dark:divide-slate-800/60">
        ${rows || '<tr><td colspan="7" class="text-center py-8 text-muted">目前沒有成員</td></tr>'}
      </tbody>
    </table>
  </section>
  `;

  return renderPageShell({
    title: "團隊儀表板 · 双云 AI 行銷部",
    active: "members",
    subtitle: `團隊儀表板 · ${totalMembers} 位夥伴`,
    body
  });
}
