/**
 * Brain Briefing — 三腦合一後的腦會議階段。
 *
 * 在 dispatch 進入 skill 執行之前，先把「双云策略腦 + 師傅腦 + 品牌腦」
 * 融合後的 RuntimeBrainContext 丟給 Claude，產出一份結構化的 TaskBrief
 * （angle / keyMessages / toneConstraints / referenceCaseIds / avoidList /
 *   masterPlaybookId），作為 skill 執行的精準輸入。
 *
 * 設計要點：
 * - 一次 Claude call，產物給所有後續 skill 共用，省 token 且保持一致性
 * - 失敗時走 fallback，不阻擋 dispatch 主流程
 * - 成功與失敗都會寫 trace 與 cost_ledger
 */

import { randomUUID } from "node:crypto";
import type { RuntimeBrainContext } from "@shuangyun/brain";
import type { BrandBrain, Client, Task, TaskBrief, TraceLog } from "@shuangyun/shared-types";
import {
  appendEntry,
  ensureDailyBudgetAvailable,
  estimateClaudeCost,
  estimatePromptTokens
} from "../auth/cost-ledger.js";
import { callClaudeWithUsage } from "../integrations/anthropic.js";
import type { RepositoryBundle } from "../repositories/bundle.js";

export type BrainBriefingResult = {
  brief: TaskBrief;
  traces: TraceLog[];
  fallbackUsed: boolean;
  /** 實際花費，給 dispatch 層累計到 DispatchCostSummary；fallback 路徑會為 0 */
  costEstimatedUsd: number;
  costInputTokens: number;
  costOutputTokens: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function clipSummary(value: string, limit = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
}

function buildBriefingPrompts(
  task: Task,
  client: Client,
  brandBrain: BrandBrain,
  runtimeBrain: RuntimeBrainContext
): { system: string; user: string } {
  const caseBlock = runtimeBrain.relevantCases.length
    ? runtimeBrain.relevantCases
        .map(
          (c, index) =>
            `${index + 1}. [${c.caseId}] ${c.summary}\n   重點：${c.takeaway}`
        )
        .join("\n")
    : "（無命中案例）";

  const playbookBlock = runtimeBrain.masterPlaybooks.length
    ? runtimeBrain.masterPlaybooks
        .map((p) => `- ${p.playbookId} / ${p.name}：${p.steps.join(" → ")}`)
        .join("\n")
    : "（無適用劇本）";

  const brandAgents = Object.values(brandBrain.agents)
    .map((agent) => `  - ${agent.role}: ${clipSummary(agent.systemPrompt, 120)}`)
    .join("\n");

  const strategyDirectives = runtimeBrain.mergedDirectives
    .filter((d) => !d.startsWith("師傅腦")) // 案例已在 caseBlock 呈現，避免重複
    .slice(0, 8)
    .map((d, index) => `${index + 1}. ${d}`)
    .join("\n");

  const system = [
    "你是双云行銷的策略顧問，三腦合一之後的第一位發言人。",
    "你的任務是把「双云策略腦」「師傅腦」「客戶品牌腦」的知識融合成一份精準的 TaskBrief，供執行層的 skill 使用。",
    "",
    "請嚴格輸出 JSON，格式：",
    '{ "angle": "一句話的切入點", "keyMessages": ["訊息1", "訊息2", "訊息3"], "toneConstraints": ["..."], "referenceCaseIds": ["case_id_1"], "avoidList": ["..."], "masterPlaybookId": null }',
    "",
    "要求：",
    "- angle 一句話、具體、可執行",
    "- keyMessages 3-5 個必須出現的訊息點",
    "- toneConstraints 至少帶上品牌腦的 bannedTopics 與品牌語調",
    "- referenceCaseIds 從下方師傅腦案例挑 0-3 個最相關的 caseId",
    "- avoidList 至少 3 項（品牌禁區 + 師傅腦踩雷）",
    "- masterPlaybookId：若有適用劇本則填入 id，否則 null",
    "- 不要 markdown、不要額外說明，只回 JSON"
  ].join("\n");

  const user = [
    `## 客戶`,
    `名稱：${client.name}`,
    `產業：${client.industry}`,
    "",
    `## 任務`,
    `任務標題：${task.title}`,
    `任務類型：${task.type}`,
    `指定 Skill：${task.skillId}`,
    "",
    `## 双云策略腦（mergedDirectives 節錄）`,
    strategyDirectives || "（無）",
    "",
    `## 師傅腦命中案例`,
    caseBlock,
    "",
    `## 師傅腦適用劇本`,
    playbookBlock,
    "",
    `## 客戶品牌腦 4 Agent 約束`,
    brandAgents,
    "",
    "---",
    "現在請以 JSON 回覆 TaskBrief。"
  ].join("\n");

  return { system, user };
}

function buildFallbackBrief(task: Task, brandBrain: BrandBrain, runtimeBrain: RuntimeBrainContext): TaskBrief {
  return {
    angle: `（自動 fallback）為 ${task.title} 產出客戶專屬內容`,
    keyMessages: [task.title, "符合品牌腦約束", "可直接交付"],
    toneConstraints: Object.values(brandBrain.agents)
      .slice(0, 2)
      .map((agent) => clipSummary(agent.systemPrompt, 80)),
    referenceCaseIds: runtimeBrain.relevantCases.slice(0, 2).map((c) => c.caseId),
    avoidList: ["避免誇大承諾", "避免競品比較", "避免未經驗證的數據"],
    masterPlaybookId: runtimeBrain.masterPlaybooks[0]?.playbookId ?? null
  };
}

function safeParseTaskBrief(raw: string): TaskBrief | null {
  try {
    // Claude 偶爾會包 ```json ... ``` 或前後夾雜說明
    const stripped = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const startIndex = stripped.indexOf("{");
    const endIndex = stripped.lastIndexOf("}");
    if (startIndex === -1 || endIndex === -1) {
      return null;
    }

    const jsonSlice = stripped.slice(startIndex, endIndex + 1);
    const parsed = JSON.parse(jsonSlice) as Partial<TaskBrief>;

    if (typeof parsed.angle !== "string") return null;
    if (!Array.isArray(parsed.keyMessages)) return null;
    if (!Array.isArray(parsed.toneConstraints)) return null;
    if (!Array.isArray(parsed.referenceCaseIds)) return null;
    if (!Array.isArray(parsed.avoidList)) return null;

    return {
      angle: parsed.angle,
      keyMessages: parsed.keyMessages.filter((m): m is string => typeof m === "string"),
      toneConstraints: parsed.toneConstraints.filter((t): t is string => typeof t === "string"),
      referenceCaseIds: parsed.referenceCaseIds.filter((id): id is string => typeof id === "string"),
      avoidList: parsed.avoidList.filter((a): a is string => typeof a === "string"),
      masterPlaybookId: typeof parsed.masterPlaybookId === "string" ? parsed.masterPlaybookId : null
    };
  } catch {
    return null;
  }
}

export async function runBrainBriefing(
  task: Task,
  client: Client,
  brandBrain: BrandBrain,
  runtimeBrain: RuntimeBrainContext,
  repositories: RepositoryBundle,
  actorAlias: string,
  memberId: string | null
): Promise<BrainBriefingResult> {
  const { system, user } = buildBriefingPrompts(task, client, brandBrain, runtimeBrain);

  // 預估成本並檢查預算
  const estimatedInputTokens = estimatePromptTokens(`${system}\n${user}`);
  const estimatedOutputTokens = 600;
  const estimatedUsd = estimateClaudeCost(
    process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5",
    estimatedInputTokens,
    estimatedOutputTokens
  );
  ensureDailyBudgetAvailable(repositories.costLedger, estimatedUsd);

  const startedAt = nowIso();
  const masterRecallTrace: TraceLog = {
    traceId: randomUUID(),
    taskId: task.taskId,
    clientId: client.clientId,
    phase: "master_recall",
    stepName: "recall_master_cases",
    inputSummary: clipSummary(
      `industry=${client.industry};skillId=${task.skillId};tags=jacky`
    ),
    outputSummary: runtimeBrain.relevantCases.length
      ? clipSummary(runtimeBrain.relevantCases.map((c) => c.caseId).join(","))
      : "no_master_cases_hit",
    startedAt,
    endedAt: nowIso(),
    errorCode: null
  };

  let brief: TaskBrief;
  let fallbackUsed = false;
  let briefingError: string | null = null;
  let costEstimatedUsd = 0;
  let costInputTokens = 0;
  let costOutputTokens = 0;

  try {
    const response = await callClaudeWithUsage({ system, user, maxTokens: 800 });
    const actualUsd = estimateClaudeCost(response.model, response.inputTokens, response.outputTokens);
    appendEntry(repositories.costLedger, {
      actorAlias,
      action: "brain_briefing.generate",
      estimatedUsd: actualUsd,
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      memberId,
      taskId: task.taskId
    });
    costEstimatedUsd = actualUsd;
    costInputTokens = response.inputTokens;
    costOutputTokens = response.outputTokens;

    const parsed = safeParseTaskBrief(response.text);
    if (parsed) {
      brief = parsed;
    } else {
      brief = buildFallbackBrief(task, brandBrain, runtimeBrain);
      fallbackUsed = true;
      briefingError = "brain_briefing.parse_failed";
    }
  } catch (error) {
    brief = buildFallbackBrief(task, brandBrain, runtimeBrain);
    fallbackUsed = true;
    briefingError = error instanceof Error ? `brain_briefing.error:${error.message}` : "brain_briefing.error";
  }

  const briefingTrace: TraceLog = {
    traceId: randomUUID(),
    taskId: task.taskId,
    clientId: client.clientId,
    phase: "brain_briefing",
    stepName: "generate_task_brief",
    inputSummary: clipSummary(
      `cases=${runtimeBrain.relevantCases.length};playbooks=${runtimeBrain.masterPlaybooks.length};directives=${runtimeBrain.mergedDirectives.length}`
    ),
    outputSummary: clipSummary(
      `angle=${brief.angle};keyMessages=${brief.keyMessages.length};avoidList=${brief.avoidList.length};fallback=${fallbackUsed}`
    ),
    startedAt,
    endedAt: nowIso(),
    errorCode: briefingError
  };

  return {
    brief,
    traces: [masterRecallTrace, briefingTrace],
    fallbackUsed,
    costEstimatedUsd,
    costInputTokens,
    costOutputTokens
  };
}
