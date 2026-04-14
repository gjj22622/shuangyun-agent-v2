import { randomUUID } from "node:crypto";
import type { RampUpConfig, TierRule, Wallet, WalletSnapshot, WalletTransaction } from "@shuangyun/shared-types";
import type { RepositoryBundle } from "../repositories/bundle.js";

const INITIAL_WALLET_BALANCE = 5000;
const TAIPEI_TIME_ZONE = "Asia/Taipei";

export type ActiveRampUp = RampUpConfig & {
  daysLeft: number;
};

export type PromotionResult = {
  from: Wallet["tier"];
  to: Wallet["tier"];
} | null;

export type RewardEvent =
  | "task_passed"
  | "task_minor"
  | "task_rework"
  | "task_reject"
  | "high_confidence"
  | "earn_onboarding"
  | "first_daily"
  | "weekly_streak"
  | "skill_diversity"
  | "earn_grant";

export type RewardContext = {
  reason: string;
  refTaskId?: string | null;
  createdBy?: string;
  amountOverride?: number;
};

export class InsufficientTokenBalanceError extends Error {
  constructor(
    public readonly memberId: string,
    public readonly balance: number,
    public readonly required: number,
    public readonly deficit: number
  ) {
    super("錢包餘額不足");
    this.name = "InsufficientTokenBalanceError";
  }
}

export class TierDailyCapExceededError extends Error {
  constructor(
    public readonly memberId: string,
    public readonly tier: Wallet["tier"],
    public readonly dailyCap: number,
    public readonly todaySpent: number,
    public readonly required: number
  ) {
    super("已超出今日 tier 扣款上限");
    this.name = "TierDailyCapExceededError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function taipeiDateParts(date = new Date()): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "0"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "0")
  };
}

function taipeiDateString(date = new Date()): string {
  const parts = taipeiDateParts(date);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function taipeiMonthString(date = new Date()): string {
  const parts = taipeiDateParts(date);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}`;
}

function taipeiDateFromOffset(daysOffset: number, date = new Date()): string {
  const shifted = new Date(date.getTime() + daysOffset * 24 * 60 * 60 * 1000);
  return taipeiDateString(shifted);
}

function startOfTaipeiDayIso(date = new Date(), daysOffset = 0): string {
  const parts = taipeiDateParts(new Date(date.getTime() + daysOffset * 24 * 60 * 60 * 1000));
  const utcMillis = Date.UTC(parts.year, parts.month - 1, parts.day, -8, 0, 0, 0);
  return new Date(utcMillis).toISOString();
}

function daysBetween(startIso: string, end: Date): number {
  const start = new Date(startIso);
  const diff = start.getTime() - end.getTime();
  return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

function getBaseReward(event: RewardEvent): { amount: number; type: WalletTransaction["type"]; applyRampUp: boolean } {
  switch (event) {
    case "task_passed":
      return { amount: 200, type: "earn_task_passed", applyRampUp: true };
    case "task_minor":
      return { amount: 100, type: "earn_task_minor", applyRampUp: true };
    case "task_rework":
      return { amount: 0, type: "earn_task_minor", applyRampUp: false };
    case "task_reject":
      return { amount: -100, type: "penalty_reject", applyRampUp: false };
    case "high_confidence":
      return { amount: 100, type: "earn_high_confidence", applyRampUp: true };
    case "earn_onboarding":
      return { amount: 1000, type: "earn_onboarding", applyRampUp: true };
    case "first_daily":
      return { amount: 50, type: "earn_first_daily", applyRampUp: true };
    case "weekly_streak":
      return { amount: 500, type: "earn_weekly_streak", applyRampUp: true };
    case "skill_diversity":
      return { amount: 300, type: "earn_skill_diversity", applyRampUp: true };
    case "earn_grant":
      return { amount: 0, type: "earn_grant", applyRampUp: true };
  }
}

function createWalletTransaction(input: {
  memberId: string;
  amount: number;
  type: WalletTransaction["type"];
  reason: string;
  refTaskId?: string | null;
  multiplier: number;
  originalAmount: number;
  createdAt: string;
  createdBy: string;
}): WalletTransaction {
  return {
    txId: randomUUID(),
    memberId: input.memberId,
    amount: input.amount,
    type: input.type,
    reason: input.reason,
    refTaskId: input.refTaskId ?? null,
    multiplier: input.multiplier,
    originalAmount: input.originalAmount,
    createdAt: input.createdAt,
    createdBy: input.createdBy
  };
}

function writeTierPromotionTrace(
  repositories: RepositoryBundle,
  memberId: string,
  from: Wallet["tier"],
  to: Wallet["tier"],
  lifetimeEarned: number
): void {
  repositories.traces.save({
    traceId: randomUUID(),
    taskId: null,
    clientId: null,
    phase: "auth_audit",
    stepName: "tier.promoted",
    inputSummary: `memberId=${memberId};from=${from};to=${to}`,
    outputSummary: `lifetimeEarned=${lifetimeEarned}`,
    startedAt: nowIso(),
    endedAt: nowIso(),
    errorCode: null
  });
}

export function ensureWalletForMember(repositories: RepositoryBundle, memberId: string): Wallet {
  const existing = repositories.wallets.getByMemberId(memberId);
  if (existing) {
    return existing;
  }
  const timestamp = nowIso();
  const wallet: Wallet = {
    memberId,
    balance: INITIAL_WALLET_BALANCE,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    tier: "Bronze",
    tierUpdatedAt: timestamp,
    lastGrantAt: null,
    lastDailyBonusAt: null,
    currentStreakDays: 0,
    lastStreakDate: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  repositories.wallets.upsert(wallet);
  return wallet;
}

export function ensureWalletForAllMembers(repositories: RepositoryBundle): {
  ensured: number;
  tierCounts: Record<Wallet["tier"], number>;
} {
  const tierCounts: Record<Wallet["tier"], number> = {
    Bronze: 0,
    Silver: 0,
    Gold: 0,
    Platinum: 0
  };
  let ensured = 0;

  for (const member of repositories.teamMembers.listAll()) {
    const existing = repositories.wallets.getByMemberId(member.memberId);
    const wallet = existing ?? ensureWalletForMember(repositories, member.memberId);
    if (!existing) {
      ensured += 1;
    }
    tierCounts[wallet.tier] += 1;
  }

  return { ensured, tierCounts };
}

export function getCurrentRampUp(repositories: RepositoryBundle, now = new Date()): ActiveRampUp | null {
  const current = repositories.rampUps.getCurrentActive(now.toISOString());
  if (!current) {
    return null;
  }
  return {
    ...current,
    daysLeft: daysBetween(current.endDate, now)
  };
}

export function calculateTier(lifetimeEarned: number, tierRules: TierRule[]): Wallet["tier"] {
  const sorted = [...tierRules].sort((left, right) => right.threshold - left.threshold);
  return sorted.find((rule) => lifetimeEarned >= rule.threshold)?.tier ?? "Bronze";
}

export function estimateTokenCost(estimatedUsd: number): number {
  return Math.max(0, Math.ceil(estimatedUsd * 1000));
}

export function ensureTokenBalanceAndCap(
  repositories: RepositoryBundle,
  memberId: string,
  estimatedTokenCost: number,
  now = new Date()
): { wallet: Wallet; tierRule: TierRule; todaySpent: number; required: number } {
  const wallet = ensureWalletForMember(repositories, memberId);
  const tierRule = repositories.tierRules.getByTier(wallet.tier);
  if (!tierRule) {
    throw new Error(`Tier rule ${wallet.tier} not found.`);
  }
  if (wallet.balance < estimatedTokenCost) {
    throw new InsufficientTokenBalanceError(memberId, wallet.balance, estimatedTokenCost, estimatedTokenCost - wallet.balance);
  }
  const todaySpent = repositories.walletTransactions.getTodaySpend(memberId, taipeiDateString(now));
  if (todaySpent + estimatedTokenCost > tierRule.dailyCap) {
    throw new TierDailyCapExceededError(memberId, wallet.tier, tierRule.dailyCap, todaySpent, estimatedTokenCost);
  }
  return {
    wallet,
    tierRule,
    todaySpent,
    required: estimatedTokenCost
  };
}

export function deductForDispatch(
  repositories: RepositoryBundle,
  memberId: string,
  actualUsd: number,
  taskId: string,
  createdBy = "system"
): { wallet: Wallet; deducted: number } {
  const deducted = estimateTokenCost(actualUsd);
  return repositories.withTransaction(() => {
    const wallet = ensureWalletForMember(repositories, memberId);
    if (wallet.balance < deducted) {
      throw new InsufficientTokenBalanceError(memberId, wallet.balance, deducted, deducted - wallet.balance);
    }
    const timestamp = nowIso();
    repositories.walletTransactions.create(
      createWalletTransaction({
        memberId,
        amount: -deducted,
        type: "spend_dispatch",
        reason: `dispatch:${taskId}`,
        refTaskId: taskId,
        multiplier: 1,
        originalAmount: deducted,
        createdAt: timestamp,
        createdBy
      })
    );
    repositories.wallets.updateBalance(memberId, wallet.balance - deducted, timestamp);
    repositories.wallets.incrementLifetime(memberId, {
      spentDelta: deducted,
      updatedAt: timestamp
    });
    return {
      wallet: ensureWalletForMember(repositories, memberId),
      deducted
    };
  });
}

export function rewardFromEvent(
  repositories: RepositoryBundle,
  memberId: string,
  event: RewardEvent,
  context: RewardContext
): { wallet: Wallet; transaction: WalletTransaction | null; promotion: PromotionResult; appliedAmount: number } {
  const base = getBaseReward(event);
  if (base.amount === 0 && event !== "earn_grant") {
    return {
      wallet: ensureWalletForMember(repositories, memberId),
      transaction: null,
      promotion: null,
      appliedAmount: 0
    };
  }
  return repositories.withTransaction(() => {
    const wallet = ensureWalletForMember(repositories, memberId);
    const timestamp = nowIso();
    const rampUp = base.applyRampUp ? getCurrentRampUp(repositories) : null;
    const originalAmount = event === "earn_grant" ? Math.max(0, Math.trunc(context.amountOverride ?? 0)) : Math.abs(base.amount);
    const multiplier = base.applyRampUp ? rampUp?.multiplier ?? 1 : 1;
    const signedBaseAmount =
      event === "earn_grant"
        ? originalAmount
        : base.amount >= 0
          ? originalAmount
          : -originalAmount;
    const appliedAmount =
      signedBaseAmount >= 0 ? Math.round(signedBaseAmount * multiplier) : -Math.round(Math.abs(signedBaseAmount));
    if (appliedAmount === 0) {
      return {
        wallet,
        transaction: null,
        promotion: null,
        appliedAmount: 0
      };
    }
    const nextBalance = Math.max(0, wallet.balance + appliedAmount);
    const effectiveAmount = nextBalance - wallet.balance;
    const transaction = createWalletTransaction({
      memberId,
      amount: effectiveAmount,
      type: base.type,
      reason: context.reason,
      refTaskId: context.refTaskId ?? null,
      multiplier,
      originalAmount,
      createdAt: timestamp,
      createdBy: context.createdBy ?? "system"
    });
    repositories.walletTransactions.create(transaction);
    repositories.wallets.updateBalance(memberId, nextBalance, timestamp);
    repositories.wallets.incrementLifetime(memberId, {
      earnedDelta: effectiveAmount > 0 ? effectiveAmount : 0,
      spentDelta: effectiveAmount < 0 ? Math.abs(effectiveAmount) : 0,
      updatedAt: timestamp,
      ...(base.type === "earn_grant" ? { lastGrantAt: timestamp } : {}),
      ...(base.type === "earn_first_daily" ? { lastDailyBonusAt: timestamp } : {})
    });

    const refreshedWallet = ensureWalletForMember(repositories, memberId);
    const tierRules = repositories.tierRules.listAll();
    const nextTier = calculateTier(refreshedWallet.lifetimeEarned, tierRules);
    let promotion: PromotionResult = null;
    if (nextTier !== refreshedWallet.tier) {
      promotion = { from: refreshedWallet.tier, to: nextTier };
      repositories.wallets.updateTier(memberId, nextTier, timestamp);
      writeTierPromotionTrace(repositories, memberId, refreshedWallet.tier, nextTier, refreshedWallet.lifetimeEarned);
    }

    return {
      wallet: ensureWalletForMember(repositories, memberId),
      transaction,
      promotion,
      appliedAmount: effectiveAmount
    };
  });
}

export function grantTokens(
  repositories: RepositoryBundle,
  memberId: string,
  amount: number,
  reason: string,
  createdBy: string
): { wallet: Wallet; transaction: WalletTransaction | null; promotion: PromotionResult; appliedAmount: number } {
  return rewardFromEvent(repositories, memberId, "earn_grant", {
    reason,
    createdBy,
    refTaskId: null,
    amountOverride: amount
  });
}

export function penaltyTokens(
  repositories: RepositoryBundle,
  memberId: string,
  amount: number,
  reason: string,
  createdBy: string
): { wallet: Wallet; transaction: WalletTransaction } {
  return repositories.withTransaction(() => {
    const wallet = ensureWalletForMember(repositories, memberId);
    const timestamp = nowIso();
    const deducted = Math.min(wallet.balance, amount);
    const transaction = createWalletTransaction({
      memberId,
      amount: -deducted,
      type: "spend_penalty",
      reason,
      refTaskId: null,
      multiplier: 1,
      originalAmount: amount,
      createdAt: timestamp,
      createdBy
    });
    repositories.walletTransactions.create(transaction);
    repositories.wallets.updateBalance(memberId, wallet.balance - deducted, timestamp);
    repositories.wallets.incrementLifetime(memberId, {
      spentDelta: deducted,
      updatedAt: timestamp
    });
    return {
      wallet: ensureWalletForMember(repositories, memberId),
      transaction
    };
  });
}

export function getTodayFirstDailyBonus(repositories: RepositoryBundle, memberId: string, now = new Date()): number {
  const wallet = ensureWalletForMember(repositories, memberId);
  return wallet.lastDailyBonusAt && taipeiDateString(new Date(wallet.lastDailyBonusAt)) === taipeiDateString(now) ? 0 : 50;
}

export function updateStreak(
  repositories: RepositoryBundle,
  memberId: string,
  now = new Date()
): { currentStreakDays: number; triggeredWeeklyStreak: boolean } {
  return repositories.withTransaction(() => {
    const wallet = ensureWalletForMember(repositories, memberId);
    const today = taipeiDateString(now);
    const yesterday = taipeiDateFromOffset(-1, now);

    if (wallet.lastStreakDate === today) {
      return {
        currentStreakDays: wallet.currentStreakDays,
        triggeredWeeklyStreak: false
      };
    }

    const nextStreakDays = wallet.lastStreakDate === yesterday ? wallet.currentStreakDays + 1 : 1;
    const triggeredWeeklyStreak = nextStreakDays >= 7;
    repositories.wallets.updateStreak(memberId, {
      currentStreakDays: triggeredWeeklyStreak ? 0 : nextStreakDays,
      lastStreakDate: today,
      updatedAt: nowIso()
    });
    return {
      currentStreakDays: triggeredWeeklyStreak ? 0 : nextStreakDays,
      triggeredWeeklyStreak
    };
  });
}

export function buildWalletSnapshot(
  repositories: RepositoryBundle,
  memberId: string,
  thisTaskDeduct: number,
  options: {
    earnedFromThisTask?: number;
    promotionJustHappened?: PromotionResult;
    now?: Date;
  } = {}
): WalletSnapshot {
  const now = options.now ?? new Date();
  const wallet = ensureWalletForMember(repositories, memberId);
  const tierRules = repositories.tierRules.listAll();
  const currentRule = repositories.tierRules.getByTier(wallet.tier);
  if (!currentRule) {
    throw new Error(`Tier rule ${wallet.tier} not found.`);
  }
  const sorted = [...tierRules].sort((left, right) => left.threshold - right.threshold);
  const nextRule = sorted.find((rule) => rule.threshold > wallet.lifetimeEarned) ?? null;
  const rampUp = getCurrentRampUp(repositories, now);

  return {
    thisTaskDeduct,
    balance: wallet.balance,
    tier: wallet.tier,
    tierIcon: currentRule.icon,
    nextTierGap: nextRule ? Math.max(0, nextRule.threshold - wallet.lifetimeEarned) : null,
    nextTier: nextRule?.tier ?? null,
    earnThisMonth: repositories.walletTransactions.getMonthlyEarn(memberId, taipeiMonthString(now)),
    currentStreakDays: wallet.currentStreakDays,
    rampUp: rampUp ? { multiplier: rampUp.multiplier, daysLeft: rampUp.daysLeft } : null,
    earnedFromThisTask: options.earnedFromThisTask ?? 0,
    promotionJustHappened: options.promotionJustHappened ?? null
  };
}

export function getTaipeiWeekSinceIso(now = new Date()): string {
  return startOfTaipeiDayIso(now, -6);
}

export function shouldRewardSkillDiversity(
  repositories: RepositoryBundle,
  memberId: string,
  currentSkillId: string,
  now = new Date()
): boolean {
  const since = getTaipeiWeekSinceIso(now);
  const recentSkills = new Set(
    repositories.memberActivity
      .listByMemberId(memberId, { since, limit: 1000 })
      .map((entry) => entry.skillId)
      .filter(Boolean)
  );
  recentSkills.add(currentSkillId);
  if (recentSkills.size < 3) {
    return false;
  }
  const rewarded = repositories.walletTransactions
    .listByMemberId(memberId, { since, type: "earn_skill_diversity", limit: 1 })
    .length;
  return rewarded === 0;
}
