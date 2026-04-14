import { describe, expect, it } from "vitest";
import { openDatabase, runMigrations } from "../database/sqlite.js";
import { createRepositoryBundle } from "../repositories/bundle.js";
import {
  InsufficientTokenBalanceError,
  ensureTokenBalanceAndCap,
  ensureWalletForMember,
  grantTokens,
  rewardFromEvent,
  updateStreak
} from "./wallet.js";

function createFixture() {
  const database = openDatabase(":memory:");
  runMigrations(database);
  const repositories = createRepositoryBundle(database);
  repositories.teamMembers.upsert({
    memberId: "mbr_sophia01",
    alias: "sophia",
    displayName: "Sophia",
    role: "operator",
    email: null,
    status: "active",
    joinedAt: "2026-04-01T00:00:00.000Z",
    lastSeenAt: "2026-04-09T08:00:00.000Z",
    notes: []
  });
  ensureWalletForMember(repositories, "mbr_sophia01");
  return { database, repositories };
}

describe("wallet helpers", () => {
  it("throws InsufficientTokenBalanceError when balance is below required cost", () => {
    const { database, repositories } = createFixture();
    repositories.wallets.upsert({
      ...ensureWalletForMember(repositories, "mbr_sophia01"),
      balance: 100,
      updatedAt: "2026-04-09T00:00:00.000Z"
    });

    expect(() => ensureTokenBalanceAndCap(repositories, "mbr_sophia01", 500)).toThrow(InsufficientTokenBalanceError);

    database.close();
  });

  it("applies active ramp-up multiplier to earn rewards", () => {
    const { database, repositories } = createFixture();

    const result = rewardFromEvent(repositories, "mbr_sophia01", "task_passed", {
      reason: "task passed",
      refTaskId: "task_001",
      createdBy: "system"
    });

    expect(result.appliedAmount).toBe(400);
    expect(result.transaction?.amount).toBe(400);
    expect(result.transaction?.multiplier).toBe(2);
    expect(result.wallet.lifetimeEarned).toBe(400);

    database.close();
  });

  it("promotes tier when lifetime earned crosses threshold", () => {
    const { database, repositories } = createFixture();
    repositories.rampUps.create({
      id: "rampup_initial_001",
      startDate: "2026-03-01T00:00:00.000Z",
      endDate: "2026-03-08T00:00:00.000Z",
      multiplier: 2,
      reason: "expired",
      createdAt: "2026-03-01T00:00:00.000Z",
      createdBy: "system"
    });
    repositories.wallets.upsert({
      ...ensureWalletForMember(repositories, "mbr_sophia01"),
      balance: 5000,
      lifetimeEarned: 4900,
      tier: "Bronze",
      tierUpdatedAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-09T00:00:00.000Z"
    });

    const result = grantTokens(repositories, "mbr_sophia01", 200, "promotion test", "jacky");

    expect(result.promotion).toEqual({ from: "Bronze", to: "Silver" });
    expect(result.wallet.tier).toBe("Silver");
    expect(result.wallet.lifetimeEarned).toBe(5100);

    database.close();
  });

  it("resets streak after seven straight Taipei days", () => {
    const { database, repositories } = createFixture();
    repositories.rampUps.create({
      id: "rampup_initial_001",
      startDate: "2026-03-01T00:00:00.000Z",
      endDate: "2026-03-08T00:00:00.000Z",
      multiplier: 2,
      reason: "expired",
      createdAt: "2026-03-01T00:00:00.000Z",
      createdBy: "system"
    });
    repositories.wallets.upsert({
      ...ensureWalletForMember(repositories, "mbr_sophia01"),
      currentStreakDays: 6,
      lastStreakDate: "2026-04-08",
      updatedAt: "2026-04-08T00:00:00.000Z"
    });

    const result = updateStreak(repositories, "mbr_sophia01", new Date("2026-04-09T02:00:00.000Z"));

    expect(result.triggeredWeeklyStreak).toBe(true);
    expect(repositories.wallets.getByMemberId("mbr_sophia01")?.currentStreakDays).toBe(0);

    database.close();
  });

  it("penalty does not reduce lifetime earned", () => {
    const { database, repositories } = createFixture();

    rewardFromEvent(repositories, "mbr_sophia01", "task_reject", {
      reason: "reject",
      refTaskId: "task_002",
      createdBy: "system"
    });

    const wallet = repositories.wallets.getByMemberId("mbr_sophia01");
    expect(wallet?.lifetimeEarned).toBe(0);
    expect(wallet?.lifetimeSpent).toBe(100);

    database.close();
  });
});
