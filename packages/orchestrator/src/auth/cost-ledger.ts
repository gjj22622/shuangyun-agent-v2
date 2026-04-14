import { randomUUID } from "node:crypto";
import type { CostLedgerEntry, MemberSnapshot } from "@shuangyun/shared-types";
import type { CostLedgerRepository, RepositoryBundle } from "../repositories/bundle.js";

export const DEFAULT_DAILY_COST_BUDGET_USD = 5;
export const ESTIMATED_TOKENS_PER_CHAR = 0.25;

export class DailyBudgetExceededError extends Error {
  constructor(
    public readonly todayUsd: number,
    public readonly budgetUsd: number
  ) {
    super("今日成本額度已滿");
    this.name = "DailyBudgetExceededError";
  }
}

export class MemberQuotaExceededError extends Error {
  constructor(
    public readonly memberId: string,
    public readonly usedUsd: number,
    public readonly quotaUsd: number,
    public readonly remainingUsd: number,
    public readonly resetAt: string
  ) {
    super("成員今日配額不足");
    this.name = "MemberQuotaExceededError";
  }
}

export type CostLedgerInput = {
  actorAlias: string;
  action: string;
  estimatedUsd: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  createdAt?: string;
  memberId?: string | null;
  taskId?: string | null;
};

export type TodayCostSnapshot = {
  date: string;
  todayUsd: number;
  budgetUsd: number;
  remainingUsd: number;
};

function todayDateString(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function startOfDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toIso(date: Date): string {
  return date.toISOString();
}

function sumUsd(entries: Array<{ estimatedUsd: number }>): number {
  return Number(entries.reduce((sum, entry) => sum + entry.estimatedUsd, 0).toFixed(6));
}

export function getDailyCostBudgetUsd(): number {
  const parsed = Number(process.env.DAILY_COST_BUDGET_USD ?? DEFAULT_DAILY_COST_BUDGET_USD);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_COST_BUDGET_USD;
}

export function getTodayTotalUsd(costLedger: CostLedgerRepository, date = todayDateString()): number {
  return costLedger.getTotalByDate(date);
}

export function getTodaySnapshot(costLedger: CostLedgerRepository, date = todayDateString()): TodayCostSnapshot {
  const todayUsd = Number(getTodayTotalUsd(costLedger, date).toFixed(6));
  const budgetUsd = Number(getDailyCostBudgetUsd().toFixed(6));
  const remainingUsd = Number(Math.max(0, budgetUsd - todayUsd).toFixed(6));
  return {
    date,
    todayUsd,
    budgetUsd,
    remainingUsd
  };
}

export function appendEntry(costLedger: CostLedgerRepository, input: CostLedgerInput): CostLedgerEntry {
  const createdAt = input.createdAt ?? nowIso();
  const entry: CostLedgerEntry & { id: string; memberId?: string | null; taskId?: string | null } = {
    id: randomUUID(),
    date: todayDateString(new Date(createdAt)),
    actorAlias: input.actorAlias,
    action: input.action,
    estimatedUsd: Number(input.estimatedUsd.toFixed(6)),
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    createdAt,
    memberId: input.memberId ?? null,
    taskId: input.taskId ?? null
  };
  costLedger.create(entry);
  return entry;
}

export function estimateClaudeCost(_model: string, inputTokens: number, outputTokens: number): number {
  const inputRate = Number(process.env.CLAUDE_INPUT_USD_PER_MTOK ?? "3");
  const outputRate = Number(process.env.CLAUDE_OUTPUT_USD_PER_MTOK ?? "15");
  return (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
}

export function estimatePromptTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length * ESTIMATED_TOKENS_PER_CHAR));
}

export function ensureDailyBudgetAvailable(
  costLedger: CostLedgerRepository,
  estimatedUsd: number
): { todayUsd: number; budgetUsd: number } {
  const todayUsd = getTodayTotalUsd(costLedger);
  const budgetUsd = getDailyCostBudgetUsd();
  if (todayUsd + estimatedUsd > budgetUsd) {
    throw new DailyBudgetExceededError(todayUsd, budgetUsd);
  }
  return { todayUsd, budgetUsd };
}

export function ensureMemberQuotaAvailable(
  repositories: RepositoryBundle,
  memberId: string,
  estimatedUsd: number,
  date = todayDateString()
): { usedUsd: number; quotaUsd: number; remainingUsd: number; resetAt: string } {
  const quota = repositories.memberQuotas.getByMemberId(memberId);
  if (!quota || quota.dailyUsd === null) {
    return {
      usedUsd: 0,
      quotaUsd: Number.POSITIVE_INFINITY,
      remainingUsd: Number.POSITIVE_INFINITY,
      resetAt: `${date}T23:59:59.999Z`
    };
  }
  const quotaUsd = quota.dailyUsd;
  const usedUsd = repositories.costLedger.getMemberDailyTotal(memberId, date);
  const remainingUsd = Number(Math.max(0, quotaUsd - usedUsd).toFixed(6));
  const resetAt = `${date}T23:59:59.999Z`;
  if (usedUsd + estimatedUsd > quotaUsd) {
    throw new MemberQuotaExceededError(memberId, usedUsd, quotaUsd, remainingUsd, resetAt);
  }
  return {
    usedUsd,
    quotaUsd,
    remainingUsd,
    resetAt
  };
}

export function getMemberSnapshot(repositories: RepositoryBundle, memberId: string, now = new Date()): MemberSnapshot {
  const member = repositories.teamMembers.getById(memberId);
  const todayStart = startOfDay(now);
  const weekStart = addDays(todayStart, -6);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const todayEntries = repositories.memberActivity.listByMemberId(memberId, { since: toIso(todayStart), limit: 10_000 });
  const weekEntries = repositories.memberActivity.listByMemberId(memberId, { since: toIso(weekStart), limit: 10_000 });
  const monthEntries = repositories.memberActivity.listByMemberId(memberId, { since: toIso(monthStart), limit: 10_000 });
  const quota = repositories.memberQuotas.getByMemberId(memberId);
  const dailyUsd = quota?.dailyUsd ?? getDailyCostBudgetUsd();
  const lastActiveAt = todayEntries[0]?.startedAt ?? weekEntries[0]?.startedAt ?? monthEntries[0]?.startedAt ?? member?.lastSeenAt ?? null;
  const tooBusy = dailyUsd > 0 && sumUsd(todayEntries) / dailyUsd >= 0.8;
  const tooQuiet = Boolean(lastActiveAt && new Date(lastActiveAt).getTime() < addDays(todayStart, -7).getTime() && member?.status !== "paused");

  return {
    memberId,
    today: {
      usd: sumUsd(todayEntries),
      taskCount: todayEntries.length
    },
    thisWeek: {
      usd: sumUsd(weekEntries),
      taskCount: weekEntries.length
    },
    thisMonth: {
      usd: sumUsd(monthEntries),
      taskCount: monthEntries.length
    },
    quota: {
      dailyUsd,
      weeklyUsd: quota?.weeklyUsd ?? null,
      monthlyUsd: quota?.monthlyUsd ?? null
    },
    lastActiveAt,
    statusHint: tooBusy ? "too_busy" : tooQuiet ? "too_quiet" : "normal"
  };
}
