import { afterEach, describe, expect, it } from "vitest";
import {
  DailyBudgetExceededError,
  MemberQuotaExceededError,
  appendEntry,
  ensureDailyBudgetAvailable,
  ensureMemberQuotaAvailable,
  getMemberSnapshot,
  getTodaySnapshot,
  getTodayTotalUsd
} from "./cost-ledger.js";
import { openDatabase, runMigrations } from "../database/sqlite.js";
import { createRepositoryBundle } from "../repositories/bundle.js";

function seedMemberFixture() {
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

  repositories.memberQuotas.upsert({
    memberId: "mbr_sophia01",
    dailyUsd: 2,
    weeklyUsd: 10,
    monthlyUsd: 50,
    taskCountDailyTarget: 5,
    updatedAt: "2026-04-01T00:00:00.000Z",
    updatedBy: "jacky"
  });

  repositories.clients.create({
    clientId: "client_demo_001",
    name: "Demo Client",
    industry: "AI",
    createdAt: "2026-04-01T00:00:00.000Z",
    status: "active",
    googleFormUrl: null,
    googleSheetId: null,
    dataroomPath: "/tmp/demo",
    subscription: {
      tier: "pro",
      agentLevel: 2,
      satisfaction: 8,
      monthlyFee: 1000
    }
  });

  repositories.skills.save({
    skillId: "content-writing",
    name: "Content Writing",
    kind: "workflow",
    category: "content_writing",
    version: "1.0.0",
    description: "demo",
    inputSchema: {},
    outputSchema: {},
    blocks: [],
    isShared: true
  });

  repositories.tasks.create({
    taskId: "task_001",
    clientId: "client_demo_001",
    title: "Demo task",
    type: "content",
    skillId: "content-writing",
    status: "done",
    createdBy: "partner",
    createdAt: "2026-04-09T08:00:00.000Z",
    dueAt: null,
    completedAt: "2026-04-09T08:15:00.000Z",
    assignee: "content-writing",
    progress: 100,
    resultFormRowId: null
  });

  repositories.outputs.save({
    outputId: "output_001",
    taskId: "task_001",
    clientId: "client_demo_001",
    type: "content",
    title: "Demo output",
    contentBody: "Line 1\nLine 2",
    assetUrls: [],
    skillUsed: "content-writing",
    review: {
      bossScore: 9,
      bossNote: "good",
      managerScore: 8,
      managerNote: "clear",
      windowScore: 8,
      windowNote: "usable",
      brandScore: 9,
      brandNote: "on brand",
      verdict: "pass",
      confidence: 92,
      reasoningTrace: "demo"
    },
    status: "passed",
    formRowId: null,
    createdAt: "2026-04-09T08:15:00.000Z"
  });

  return { database, repositories };
}

describe("cost ledger", () => {
  afterEach(() => {
    delete process.env.DAILY_COST_BUDGET_USD;
  });

  it("rejects requests when daily budget would be exceeded", () => {
    const database = openDatabase(":memory:");
    runMigrations(database);
    const repositories = createRepositoryBundle(database);
    process.env.DAILY_COST_BUDGET_USD = "5";

    appendEntry(repositories.costLedger, {
      actorAlias: "jacky",
      action: "anthropic.generate_draft",
      estimatedUsd: 4.9,
      model: "claude-sonnet-4-5",
      inputTokens: 100,
      outputTokens: 100
    });

    expect(() => ensureDailyBudgetAvailable(repositories.costLedger, 0.2)).toThrow(DailyBudgetExceededError);
    expect(getTodayTotalUsd(repositories.costLedger)).toBeCloseTo(4.9, 4);

    database.close();
  });

  it("builds a rounded snapshot for the current day", () => {
    const database = openDatabase(":memory:");
    runMigrations(database);
    const repositories = createRepositoryBundle(database);
    process.env.DAILY_COST_BUDGET_USD = "5";

    appendEntry(repositories.costLedger, {
      actorAlias: "sophia",
      action: "anthropic.committee_review.brand",
      estimatedUsd: 0.42,
      model: "claude-sonnet-4-5",
      inputTokens: 120,
      outputTokens: 80,
      createdAt: "2026-04-09T08:30:00.000Z"
    });

    appendEntry(repositories.costLedger, {
      actorAlias: "jacky",
      action: "google_forms.write_output",
      estimatedUsd: 0.08,
      model: "google-forms-symbolic",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: "2026-04-09T09:00:00.000Z"
    });

    const snapshot = getTodaySnapshot(repositories.costLedger, "2026-04-09");

    expect(snapshot).toEqual({
      date: "2026-04-09",
      todayUsd: 0.5,
      budgetUsd: 5,
      remainingUsd: 4.5
    });

    database.close();
  });

  it("throws member quota exceeded when daily member quota would overflow", () => {
    const { database, repositories } = seedMemberFixture();

    appendEntry(repositories.costLedger, {
      actorAlias: "sophia",
      action: "anthropic.generate_draft",
      estimatedUsd: 1.9,
      model: "claude-sonnet-4-5",
      inputTokens: 100,
      outputTokens: 100,
      createdAt: "2026-04-09T08:10:00.000Z",
      memberId: "mbr_sophia01",
      taskId: "task_001"
    });

    expect(() => ensureMemberQuotaAvailable(repositories, "mbr_sophia01", 0.3, "2026-04-09")).toThrow(MemberQuotaExceededError);

    database.close();
  });

  it("falls back to global budget when member quota is missing", () => {
    const { database, repositories } = seedMemberFixture();
    process.env.DAILY_COST_BUDGET_USD = "5";
    repositories.memberQuotas.upsert({
      memberId: "mbr_sophia01",
      dailyUsd: null,
      weeklyUsd: null,
      monthlyUsd: null,
      taskCountDailyTarget: null,
      updatedAt: "2026-04-01T00:00:00.000Z",
      updatedBy: "jacky"
    });

    appendEntry(repositories.costLedger, {
      actorAlias: "sophia",
      action: "anthropic.generate_draft",
      estimatedUsd: 3,
      model: "claude-sonnet-4-5",
      inputTokens: 100,
      outputTokens: 100,
      createdAt: "2026-04-09T08:10:00.000Z",
      memberId: "mbr_sophia01",
      taskId: "task_001"
    });

    expect(() => ensureMemberQuotaAvailable(repositories, "mbr_sophia01", 0.1, "2026-04-09")).not.toThrow();

    database.close();
  });

  it("builds member snapshot with too_busy hint when daily usage reaches 80%", () => {
    const { database, repositories } = seedMemberFixture();

    appendEntry(repositories.costLedger, {
      actorAlias: "sophia",
      action: "anthropic.generate_draft",
      estimatedUsd: 1.6,
      model: "claude-sonnet-4-5",
      inputTokens: 1234,
      outputTokens: 456,
      createdAt: "2026-04-09T08:10:00.000Z",
      memberId: "mbr_sophia01",
      taskId: "task_001"
    });

    const snapshot = getMemberSnapshot(repositories, "mbr_sophia01", new Date("2026-04-09T12:00:00.000Z"));

    expect(snapshot.today.usd).toBeCloseTo(1.6, 6);
    expect(snapshot.today.taskCount).toBe(1);
    expect(snapshot.statusHint).toBe("too_busy");
    expect(snapshot.quota?.dailyUsd).toBe(2);

    database.close();
  });
});
