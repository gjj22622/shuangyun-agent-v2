import { randomUUID } from "node:crypto";
import {
  createStrategyBrain,
  evaluateCommitteeReview,
  loadMasterBrain,
  mergeThreeBrains,
  type MasterBrainTaskAttrs
} from "@shuangyun/brain";
import { assertSkillAllowed, createSkillSandbox } from "@shuangyun/hands";
import type {
  BrandBrain,
  BrainRole,
  Client,
  CommitteeReview,
  Output,
  SkillManifest,
  Task,
  TaskBrief,
  TraceLog,
  WalletSnapshot
} from "@shuangyun/shared-types";
import { runBrainBriefing } from "./brain-briefing.js";
import { assembleCommand, formatCommandAsPrompt, type FeedbackRecord } from "./command-assembler.js";
import { resolveReferences } from "./reference-injection.js";
import { appendEntry, ensureDailyBudgetAvailable, ensureMemberQuotaAvailable, estimateClaudeCost, estimatePromptTokens } from "../auth/cost-ledger.js";
import { MemberArchivedError, memberIdFromAlias } from "../auth/team-members-bootstrap.js";
import {
  buildWalletSnapshot,
  deductForDispatch,
  ensureTokenBalanceAndCap,
  estimateTokenCost,
  getTaipeiWeekSinceIso,
  getTodayFirstDailyBonus,
  rewardFromEvent,
  shouldRewardSkillDiversity,
  updateStreak
} from "../auth/wallet.js";
import { callClaudeWithUsage, type ClaudeCallInput } from "../integrations/anthropic.js";
import {
  GOOGLE_FORMS_MODEL_NAME,
  GOOGLE_FORMS_SYMBOLIC_COST_USD,
  type GoogleFormsAdapter
} from "../integrations/google-forms.js";
import type { RepositoryBundle } from "../repositories/bundle.js";

export type DispatchCostSummary = {
  estimatedUsd: number;
  inputTokens: number;
  outputTokens: number;
};

export type DispatchResult = {
  output: Output;
  traces: TraceLog[];
  /** 由 brain briefing 產出的 TaskBrief；若 briefing fallback 亦會有值（fallback 版本） */
  taskBrief: TaskBrief | null;
  /** 4 Agent committee 的完整評分，committee 失敗時為 null */
  committeeReview: CommitteeReview | null;
  /** 本次 dispatch 累計的成本摘要（供 Demo Console banner 用） */
  costSummary: DispatchCostSummary;
  walletSnapshot: WalletSnapshot | null;
};

type CommitteeAgentScore = {
  score: number;
  note: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function clipSummary(value: string, limit = 140): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
}

async function executeClaudeCallWithBudget(
  repositories: RepositoryBundle,
  actorAlias: string,
  memberId: string | null,
  taskId: string,
  action: string,
  input: ClaudeCallInput,
  costAccumulator?: DispatchCostSummary
): Promise<string> {
  const estimatedInputTokens = estimatePromptTokens(`${input.system}\n${input.user}`);
  const estimatedOutputTokens = input.maxTokens ?? 1200;
  const estimatedUsd = estimateClaudeCost(process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5", estimatedInputTokens, estimatedOutputTokens);
  ensureDailyBudgetAvailable(repositories.costLedger, estimatedUsd);
  if (memberId) {
    ensureMemberQuotaAvailable(repositories, memberId, estimatedUsd);
    ensureTokenBalanceAndCap(repositories, memberId, estimateTokenCost(estimatedUsd * 1.1));
  }

  const result = await callClaudeWithUsage(input);
  const actualUsd = estimateClaudeCost(result.model, result.inputTokens, result.outputTokens);
  appendEntry(repositories.costLedger, {
    actorAlias,
    action,
    estimatedUsd: actualUsd,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    memberId,
    taskId
  });

  if (costAccumulator) {
    costAccumulator.estimatedUsd += actualUsd;
    costAccumulator.inputTokens += result.inputTokens;
    costAccumulator.outputTokens += result.outputTokens;
  }

  return result.text;
}

async function generateDraft(
  task: Task,
  client: Client,
  mergedDirectives: string[],
  skill: SkillManifest,
  taskBrief: TaskBrief,
  repositories: RepositoryBundle,
  actorAlias: string,
  memberId: string | null,
  costAccumulator: DispatchCostSummary
): Promise<string> {
  // 將 TaskBrief 的四個關鍵欄位（angle / keyMessages / toneConstraints / avoidList）
  // 明確注入 system prompt，確保腦會議的產物真的影響 Claude 的產出
  const system = [
    "你是双云客戶 AI 行銷部的內容產出 Agent。",
    "請直接輸出可交付內容，不要解釋流程，不要加前言。",
    `客戶名稱：${client.name}`,
    `產業：${client.industry}`,
    `Skill：${skill.name}`,
    "",
    "【腦會議產出 TaskBrief — 必須嚴格遵守】",
    `切入角度（angle）：${taskBrief.angle}`,
    "必要訊息點（keyMessages）：",
    ...taskBrief.keyMessages.map((m, i) => `  ${i + 1}. ${m}`),
    "語調約束（toneConstraints）：",
    ...taskBrief.toneConstraints.map((t, i) => `  ${i + 1}. ${t}`),
    "絕對禁區（avoidList — 絕對不能出現任一項）：",
    ...taskBrief.avoidList.map((a, i) => `  ${i + 1}. ${a}`),
    taskBrief.referenceCaseIds.length
      ? `參考案例：${taskBrief.referenceCaseIds.join(", ")}`
      : "",
    "",
    "【双云策略腦 + 師傅腦指引（供參考）】",
    ...mergedDirectives.slice(0, 12).map((directive, index) => `${index + 1}. ${directive}`)
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  const user = [
    `任務類型：${task.type}`,
    `任務標題：${task.title}`,
    `指定 Skill：${skill.skillId}`,
    "",
    "請嚴格遵守上方 TaskBrief 的 angle、keyMessages 與 avoidList，產出一份可直接交給客戶或內部審稿的繁體中文內容初稿。",
    "初稿需要包含：標題 / 內容主體 / CTA 或結尾。"
  ].join("\n");

  return executeClaudeCallWithBudget(
    repositories,
    actorAlias,
    memberId,
    task.taskId,
    "anthropic.generate_draft",
    { system, user, maxTokens: 1600 },
    costAccumulator
  );
}

function safeParseCommitteeScore(content: string): CommitteeAgentScore {
  try {
    const parsed = JSON.parse(content) as Partial<CommitteeAgentScore>;
    const rawScore = typeof parsed.score === "number" ? parsed.score : Number.NaN;
    const clampedScore = Number.isInteger(rawScore) ? Math.max(0, Math.min(10, rawScore)) : 5;
    const note = typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim().slice(0, 80) : "parse_failed";
    return { score: clampedScore, note };
  } catch {
    return { score: 5, note: "parse_failed" };
  }
}

async function scoreByRole(
  role: BrainRole,
  output: Output,
  committeePrompt: string,
  repositories: RepositoryBundle,
  actorAlias: string,
  memberId: string | null,
  costAccumulator: DispatchCostSummary
): Promise<CommitteeAgentScore> {
  const system = [
    committeePrompt,
    '請以 0-10 分評分這篇產出，回傳嚴格 JSON {"score": <0-10 整數>, "note": "<=80字>"}。',
    "不要輸出 markdown，不要加任何額外說明。"
  ].join("\n\n");

  const user = [
    `產出標題：${output.title}`,
    `產出類型：${output.type}`,
    `產出內容：`,
    output.contentBody,
    `審查角色：${role}`
  ].join("\n");

  const response = await executeClaudeCallWithBudget(
    repositories,
    actorAlias,
    memberId,
    output.taskId,
    `anthropic.committee_review.${role}`,
    { system, user, maxTokens: 200 },
    costAccumulator
  );
  return safeParseCommitteeScore(response);
}

async function runCommitteeReview(
  output: Output,
  runtimeBrain: ReturnType<typeof mergeThreeBrains>,
  repositories: RepositoryBundle,
  actorAlias: string,
  memberId: string | null,
  costAccumulator: DispatchCostSummary
): Promise<ReturnType<typeof evaluateCommitteeReview>> {
  const [boss, manager, window, brand] = await Promise.all([
    scoreByRole("boss", output, runtimeBrain.committeePrompts.boss, repositories, actorAlias, memberId, costAccumulator),
    scoreByRole("manager", output, runtimeBrain.committeePrompts.manager, repositories, actorAlias, memberId, costAccumulator),
    scoreByRole("window", output, runtimeBrain.committeePrompts.window, repositories, actorAlias, memberId, costAccumulator),
    scoreByRole("brand", output, runtimeBrain.committeePrompts.brand, repositories, actorAlias, memberId, costAccumulator)
  ]);

  return evaluateCommitteeReview({ boss, manager, window, brand });
}

function deriveTaskAttrs(task: Task, client: Client): MasterBrainTaskAttrs {
  // 把 task 與 client 的屬性轉成師傅腦檢索 key
  // 目前師傅腦的 7 個案例都帶 "jacky" tag，用 industry + jacky + skillId 檢索可以命中所有 Jacky 案例
  return {
    industry: client.industry,
    tags: ["jacky", client.industry, task.skillId, task.type].filter(Boolean)
  };
}

export async function dispatchTask(
  task: Task,
  client: Client,
  brandBrain: BrandBrain,
  skill: SkillManifest,
  formsAdapter: GoogleFormsAdapter,
  repositories: RepositoryBundle,
  actorAlias = "system",
  memberId: string | null = null
): Promise<DispatchResult> {
  const resolvedMember =
    memberId !== null
      ? repositories.teamMembers.getById(memberId)
      : actorAlias === "system"
        ? null
        : repositories.teamMembers.getByAlias(actorAlias);
  const resolvedMemberId = resolvedMember?.memberId ?? (actorAlias === "system" ? null : memberId ?? memberIdFromAlias(actorAlias));
  if (resolvedMember?.status === "archived") {
    throw new MemberArchivedError(actorAlias, resolvedMember.memberId);
  }
  // 本次 dispatch 的累計成本（供 Demo Console banner + walletSnapshot 用）
  const costAccumulator: DispatchCostSummary = {
    estimatedUsd: 0,
    inputTokens: 0,
    outputTokens: 0
  };

  const strategy = createStrategyBrain([
    "Preserve SOSTAC discipline.",
    "Keep outputs concise, auditable, and client-ready."
  ]);

  // Reference injection：將品牌腦 {{ref:xxx}} 佔位符替換為文件原文（零 token）
  const resolvedBrandBrain = resolveReferences(brandBrain, task, repositories.brandDataroom);

  // 三腦合一（保留用於 committee review fallback）
  const masterBrain = loadMasterBrain(repositories);
  const taskAttrs = deriveTaskAttrs(task, client);
  const runtimeBrain = mergeThreeBrains(strategy, masterBrain, resolvedBrandBrain, taskAttrs);

  const sandbox = createSkillSandbox(client.clientId, [skill.skillId]);
  assertSkillAllowed(sandbox, task.skillId);

  // ── 零 token 指令組裝（替代 brain-briefing AI call）──
  const brainDocs = {
    strategy: runtimeBrain.mergedDirectives.join("\n## 通用規則\n- angle: SOSTAC discipline\n- tone: 專業、簡潔\n- banned: 誇大承諾"),
    master: runtimeBrain.relevantCases.map(c => `## ${c.industry} 規則\n- reference_case: ${c.summary}`).join("\n") || "## 通用規則\n- reference_case: 無",
    brand: Object.values(resolvedBrandBrain.agents).map(a => a.systemPrompt).join("\n\n") + "\n## 通用規則\n- tone: " + resolvedBrandBrain.strategyNotes.join("、")
  };
  const feedbackHistory: FeedbackRecord[] = repositories.feedbackHistory
    ? repositories.feedbackHistory.listRecent(client.clientId, task.type, 5)
    : [];
  const skillCommand = assembleCommand(task, client, brainDocs, skill, feedbackHistory);
  const taskBrief = {
    angle: skillCommand.angle,
    keyMessages: skillCommand.keyMessages,
    toneConstraints: skillCommand.toneConstraints,
    referenceCaseIds: skillCommand.referenceCases,
    avoidList: skillCommand.avoidList,
    masterPlaybookId: null
  };

  const startedAt = nowIso();
  const contentBody = await generateDraft(
    task,
    client,
    runtimeBrain.mergedDirectives,
    skill,
    taskBrief,
    repositories,
    actorAlias,
    resolvedMemberId,
    costAccumulator
  );
  const output: Output = {
    outputId: randomUUID(),
    taskId: task.taskId,
    clientId: client.clientId,
    type: task.type,
    title: `${task.title} - Draft`,
    contentBody,
    assetUrls: [],
    skillUsed: skill.skillId,
    review: null,
    status: "reviewing",
    formRowId: null,
    createdAt: startedAt
  };
  const review = await runCommitteeReview(output, runtimeBrain, repositories, actorAlias, resolvedMemberId, costAccumulator);
  output.review = review;
  output.status = review.verdict === "reject" ? "rejected" : "passed";

  const traces: TraceLog[] = [
    {
      traceId: randomUUID(),
      taskId: task.taskId,
      clientId: client.clientId,
      phase: "brain_select",
      stepName: "merge_three_brains",
      inputSummary: clipSummary(
        `strategy=${strategy.strategyId};brain=${brandBrain.brainId};master_cases=${runtimeBrain.relevantCases.length};playbooks=${runtimeBrain.masterPlaybooks.length}`
      ),
      outputSummary: clipSummary(runtimeBrain.mergedDirectives.join(" | ")),
      startedAt,
      endedAt: nowIso(),
      errorCode: null
    },
    {
      traceId: randomUUID(),
      taskId: task.taskId,
      clientId: client.clientId,
      phase: "skill_run",
      stepName: "execute_skill",
      inputSummary: clipSummary(`skill=${skill.skillId};sandbox=${sandbox.clientId};task=${task.title}`),
      outputSummary: clipSummary(output.contentBody),
      startedAt,
      endedAt: nowIso(),
      errorCode: null
    },
    {
      traceId: randomUUID(),
      taskId: task.taskId,
      clientId: client.clientId,
      phase: "committee_review",
      stepName: "score_output",
      inputSummary: clipSummary(`${output.title};${output.contentBody}`),
      outputSummary: clipSummary(
        `boss=${review.bossScore}:${review.bossNote};manager=${review.managerScore}:${review.managerNote};` +
          `window=${review.windowScore}:${review.windowNote};brand=${review.brandScore}:${review.brandNote};${review.reasoningTrace}`,
        220
      ),
      startedAt,
      endedAt: nowIso(),
      errorCode: null
    }
  ];

  if (client.googleSheetId) {
    const formWriteStartedAt = nowIso();
    try {
      ensureDailyBudgetAvailable(repositories.costLedger, GOOGLE_FORMS_SYMBOLIC_COST_USD);
      if (resolvedMemberId) {
        ensureMemberQuotaAvailable(repositories, resolvedMemberId, GOOGLE_FORMS_SYMBOLIC_COST_USD);
        ensureTokenBalanceAndCap(repositories, resolvedMemberId, estimateTokenCost(GOOGLE_FORMS_SYMBOLIC_COST_USD * 1.1));
      }
      const formRow = await formsAdapter.writeOutput(client.googleSheetId, output);
      appendEntry(repositories.costLedger, {
        actorAlias,
        action: "google_forms.write_output",
        estimatedUsd: GOOGLE_FORMS_SYMBOLIC_COST_USD,
        model: GOOGLE_FORMS_MODEL_NAME,
        inputTokens: 0,
        outputTokens: 0,
        memberId: resolvedMemberId,
        taskId: task.taskId
      });
      output.formRowId = formRow.formRowId;
      traces.push({
        traceId: randomUUID(),
        taskId: task.taskId,
        clientId: client.clientId,
        phase: "form_write",
        stepName: "write_output_to_sheet",
        inputSummary: clipSummary(`sheet=${client.googleSheetId};output=${output.outputId};title=${output.title}`),
        outputSummary: clipSummary(`formRowId=${formRow.formRowId};rowIndex=${formRow.rowIndex};sheetId=${formRow.sheetId}`),
        startedAt: formWriteStartedAt,
        endedAt: nowIso(),
        errorCode: null
      });
    } catch (error) {
      traces.push({
        traceId: randomUUID(),
        taskId: task.taskId,
        clientId: client.clientId,
        phase: "form_write",
        stepName: "write_output_to_sheet",
        inputSummary: clipSummary(`sheet=${client.googleSheetId};output=${output.outputId};title=${output.title}`),
        outputSummary: clipSummary("Form write skipped after adapter failure."),
        startedAt: formWriteStartedAt,
        endedAt: nowIso(),
        errorCode: `form_write_failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  let walletSnapshot: WalletSnapshot | null = null;
  if (resolvedMemberId) {
    const deduction = deductForDispatch(repositories, resolvedMemberId, costAccumulator.estimatedUsd, task.taskId, actorAlias);
    let earnedFromThisTask = 0;
    let promotionJustHappened: { from: "Bronze" | "Silver" | "Gold" | "Platinum"; to: "Bronze" | "Silver" | "Gold" | "Platinum" } | null =
      null;
    const applyReward = (
      result: ReturnType<typeof rewardFromEvent>
    ) => {
      if (result.appliedAmount > 0) {
        earnedFromThisTask += result.appliedAmount;
      }
      if (result.promotion) {
        promotionJustHappened = result.promotion;
      }
    };

    if (review.verdict === "pass") {
      applyReward(
        rewardFromEvent(repositories, resolvedMemberId, "task_passed", {
          reason: `task verdict passed:${task.taskId}`,
          refTaskId: task.taskId,
          createdBy: actorAlias
        })
      );
    } else if (review.verdict === "minor_tweak") {
      applyReward(
        rewardFromEvent(repositories, resolvedMemberId, "task_minor", {
          reason: `task verdict minor_tweak:${task.taskId}`,
          refTaskId: task.taskId,
          createdBy: actorAlias
        })
      );
    } else if (review.verdict === "major_rework") {
      rewardFromEvent(repositories, resolvedMemberId, "task_rework", {
        reason: `task verdict major_rework:${task.taskId}`,
        refTaskId: task.taskId,
        createdBy: actorAlias
      });
    } else if (review.verdict === "reject") {
      rewardFromEvent(repositories, resolvedMemberId, "task_reject", {
        reason: `task verdict reject:${task.taskId}`,
        refTaskId: task.taskId,
        createdBy: actorAlias
      });
    }

    if (review.verdict === "pass" && review.confidence >= 90) {
      applyReward(
        rewardFromEvent(repositories, resolvedMemberId, "high_confidence", {
          reason: `high confidence:${task.taskId}`,
          refTaskId: task.taskId,
          createdBy: actorAlias
        })
      );
    }

    if (review.verdict !== "reject") {
      if (getTodayFirstDailyBonus(repositories, resolvedMemberId) > 0) {
        applyReward(
          rewardFromEvent(repositories, resolvedMemberId, "first_daily", {
            reason: `first daily:${task.taskId}`,
            refTaskId: task.taskId,
            createdBy: actorAlias
          })
        );
      }
      const streak = updateStreak(repositories, resolvedMemberId);
      if (streak.triggeredWeeklyStreak) {
        applyReward(
          rewardFromEvent(repositories, resolvedMemberId, "weekly_streak", {
            reason: `weekly streak:${task.taskId}`,
            refTaskId: task.taskId,
            createdBy: actorAlias
          })
        );
      }
      if (shouldRewardSkillDiversity(repositories, resolvedMemberId, task.skillId, new Date())) {
        applyReward(
          rewardFromEvent(repositories, resolvedMemberId, "skill_diversity", {
            reason: `skill diversity:${task.taskId}`,
            refTaskId: task.taskId,
            createdBy: actorAlias
          })
        );
      }
    }

    walletSnapshot = buildWalletSnapshot(repositories, resolvedMemberId, deduction.deducted, {
      earnedFromThisTask,
      promotionJustHappened
    });
  }

  // 寫入 feedback_history（供下一輪指令組裝參考）
  if (repositories.feedbackHistory) {
    try {
      repositories.feedbackHistory.create({
        id: randomUUID(),
        clientId: client.clientId,
        skillId: task.skillId,
        taskType: task.type,
        outputSummary: output.contentBody.slice(0, 200),
        createdAt: nowIso()
      });
    } catch { /* 不阻擋主流程 */ }
  }

  return {
    output,
    traces,
    taskBrief,
    committeeReview: review,
    costSummary: { ...costAccumulator },
    walletSnapshot
  };
}
