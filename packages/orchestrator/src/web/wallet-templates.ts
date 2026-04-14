/**
 * 排行榜 /leaderboard SSR template。
 * 視覺基礎來自 04_MVP規劃/previews/leaderboard.html。
 */

import { escapeHtml, renderPageShell } from "./shared-templates.js";

export type LeaderboardEntry = {
  rank?: number;
  memberId: string;
  alias: string;
  displayName: string;
  tier: string;
  tierIcon: string;
  earnThisPeriod: number;
  lifetimeEarned: number;
  weekOverWeekGrowth: number | null;
  taskCountThisPeriod: number;
};

export type LeaderboardPageInput = {
  period: string;
  entries: LeaderboardEntry[];
  rampUp: { multiplier: number; daysLeft: number; reason: string } | null;
  totalTeamEarn: number;
};

function avatarGradient(index: number): string {
  const gradients = [
    "from-red-500 via-amber-500 to-yellow-500",
    "from-red-600 to-rose-500",
    "from-sky-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-orange-500 to-amber-500",
    "from-sky-600 to-blue-600",
    "from-amber-500 to-yellow-500"
  ];
  return gradients[index % gradients.length] || "from-sky-500 to-cyan-500";
}

function podiumClass(rank: number): string {
  if (rank === 1) return "surface-2 rounded-2xl p-7 text-center scale-110 relative";
  return "surface-2 rounded-2xl p-6 text-center";
}

function podiumBorderStyle(rank: number): string {
  if (rank === 1) return "border-color:rgba(234,179,8,.5);box-shadow:0 8px 40px rgba(234,179,8,.15)";
  if (rank === 2) return "border-color:rgba(148,163,184,.45)";
  return "border-color:rgba(217,119,6,.45)";
}

function medalEmoji(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  return "🥉";
}

export function renderLeaderboard(input: LeaderboardPageInput): string {
  const sorted = input.entries.map((e, i) => ({ ...e, rank: i + 1 }));
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  const rampUpBanner = input.rampUp
    ? `<div class="zone-token rounded-xl p-4 flex items-center justify-between">
    <div class="flex items-center gap-3"><div class="text-3xl">🚀</div><div><div class="font-bold text-primary">Ramp-up 期進行中 · earn × ${input.rampUp.multiplier}</div><div class="text-xs text-secondary">剩 ${input.rampUp.daysLeft} 天 · ${escapeHtml(input.rampUp.reason)}</div></div></div>
    <div class="text-right"><div class="text-xs text-secondary uppercase font-semibold">本月團隊總 earn</div><div class="text-3xl font-bold text-amber-600 dark:text-amber-300">${input.totalTeamEarn} 🪙</div></div>
  </div>`
    : "";

  // Podium: show in order 2-1-3 visually
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  const podiumCards = podiumOrder.map((entry) => {
    if (!entry) return "";
    const rank = entry.rank ?? 0;
    const initial = entry.displayName.charAt(0);
    const isCrown = rank === 1;
    return `<div class="${podiumClass(rank)}" style="${podiumBorderStyle(rank)}">
  ${isCrown ? '<div class="absolute -top-4 left-1/2 -translate-x-1/2 text-4xl pulse-slow">👑</div>' : `<div class="text-xs text-muted mb-2 font-semibold">No. ${rank}</div>`}
  ${isCrown ? '<div class="text-xs text-amber-700 dark:text-yellow-200 mb-2 font-bold tracking-wider">CHAMPION</div>' : ''}
  <div class="text-${isCrown ? '7' : '6'}xl mb-2">${medalEmoji(rank)}</div>
  <div class="w-${isCrown ? '20' : '16'} h-${isCrown ? '20' : '16'} mx-auto rounded-full bg-gradient-to-br ${avatarGradient(rank - 1)} flex items-center justify-center text-${isCrown ? '3' : '2'}xl font-bold text-white mb-3 shadow-lg">${escapeHtml(initial)}</div>
  <div class="text-${isCrown ? 'x' : ''}lg font-bold text-primary">${escapeHtml(entry.displayName)}</div>
  <div class="text-xs text-muted mb-4">${escapeHtml(entry.tierIcon)} ${escapeHtml(entry.tier)}</div>
  <div class="text-${isCrown ? '4' : '3'}xl font-bold text-${isCrown ? 'amber-600 dark:text-amber-300' : 'primary'}">${entry.earnThisPeriod}</div>
  <div class="text-xs text-muted mt-1">本期 earn 🪙</div>
  <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 text-xs space-y-1">
    <div class="flex justify-between text-secondary"><span>任務</span><span class="text-sky-600 dark:text-sky-300 font-semibold">${entry.taskCountThisPeriod}</span></div>
    <div class="flex justify-between text-secondary"><span>Lifetime</span><span class="text-emerald-600 dark:text-emerald-300 font-semibold">${entry.lifetimeEarned}</span></div>
  </div>
</div>`;
  }).join("");

  const restRows = rest.map((entry, idx) => {
    const initial = entry.displayName.charAt(0);
    const growth = entry.weekOverWeekGrowth;
    const growthText = growth && growth > 1 ? `<div class="text-xs text-emerald-600 dark:text-emerald-400">↗ +${Math.round((growth - 1) * 100)}%</div>` : "";
    return `<div class="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-white/[.03] transition">
  <div class="text-lg font-bold text-muted w-6 text-center">${entry.rank ?? idx + 4}</div>
  <div class="w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(idx + 3)} flex items-center justify-center font-bold text-white">${escapeHtml(initial)}</div>
  <div class="flex-1"><div class="font-bold text-primary">${escapeHtml(entry.displayName)}</div><div class="text-xs text-muted">${escapeHtml(entry.tierIcon)} ${escapeHtml(entry.tier)} · 任務 ${entry.taskCountThisPeriod}</div></div>
  <div class="text-right"><div class="font-bold text-primary">${entry.earnThisPeriod}</div>${growthText}</div>
</div>`;
  }).join("");

  const periodLabel = input.period === "this_month" ? "本月 earn" : input.period === "this_week" ? "本週 earn" : "Lifetime 總榜";

  const body = `
  ${rampUpBanner}

  <div class="text-center">
    <h2 class="text-2xl font-bold text-primary">${escapeHtml(periodLabel)}</h2>
    <p class="text-xs text-muted mt-1">${input.entries.length} 位有活動的夥伴</p>
  </div>

  ${top3.length > 0 ? `<section class="grid grid-cols-3 gap-6 items-end">${podiumCards}</section>` : '<div class="surface-1 rounded-xl p-8 text-center text-muted">本期尚無活動記錄</div>'}

  ${rest.length > 0 ? `<section class="surface-2 rounded-2xl overflow-hidden">
    <div class="px-5 py-3 border-b border-slate-200 dark:border-slate-700/60"><h3 class="text-xs font-bold text-secondary uppercase tracking-widest">${top3.length + 1}+ 名</h3></div>
    <div class="divide-y divide-slate-200 dark:divide-slate-800/60">${restRows}</div>
  </section>` : ""}

  <div class="text-center text-xs text-muted">階級一經達成永久保留 · lifetime earned 只會上升</div>
  `;

  return renderPageShell({
    title: "排行榜 · 双云 AI 行銷部",
    active: "leaderboard",
    subtitle: `排行榜 · ${escapeHtml(periodLabel)}`,
    body
  });
}
