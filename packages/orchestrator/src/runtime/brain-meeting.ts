/**
 * Brain Meeting — 多輪腦會議引擎。
 *
 * Phase 1（開場）：3 腦各自發言（parallel 3 calls）
 * Phase 2（交叉審查）：3 腦互相質詢（serial 3 calls）
 * Phase 3（彙整）：合成最終 TaskBrief + ConsultationReport（1 call）
 *
 * 共 7 個 Claude calls，每輪結果即時推播給 onMessage callback（供 SSE）。
 * 任一腦失敗不阻擋整體，走 fallback。
 */

import { randomUUID } from "node:crypto";
import type { RuntimeBrainContext } from "@shuangyun/brain";
import type {
  BrainConsultationReport,
  BrainMeeting,
  BrainMeetingMessage,
  BrainMeetingMode,
  BrainMeetingPhase,
  BrainMeetingRole,
  BrandBrain,
  Client,
  TaskBrief
} from "@shuangyun/shared-types";
import { callClaudeWithUsageCheap } from "../integrations/anthropic.js";
import type { RepositoryBundle } from "../repositories/bundle.js";

export type BrainMeetingCallbackMessage = {
  phase: BrainMeetingPhase;
  role: BrainMeetingRole;
  displayName: string;
  icon: string;
  content: string;
  round: number;
  isLast: boolean;
};

export type BrainMeetingResult = {
  meetingId: string;
  taskBrief: TaskBrief;
  report: BrainConsultationReport;
  messages: BrainMeetingMessage[];
  costSummary: { estimatedUsd: number; inputTokens: number; outputTokens: number };
  fallbackUsed: boolean;
};

type OnMessageCallback = (msg: BrainMeetingCallbackMessage) => void;

const ROLE_META: Record<BrainMeetingRole, { displayName: string; icon: string }> = {
  strategy: { displayName: "双云策略腦", icon: "🧠" },
  master: { displayName: "師傅腦", icon: "🎓" },
  brand: { displayName: "品牌腦", icon: "🏷️" }
};

function nowIso(): string {
  return new Date().toISOString();
}

function clipText(value: string, limit = 240): string {
  const n = value.replace(/\s+/g, " ").trim();
  return n.length <= limit ? n : `${n.slice(0, limit)}...`;
}

function buildOpeningPrompt(
  role: BrainMeetingRole,
  client: Client,
  title: string,
  brandBrain: BrandBrain,
  runtimeBrain: RuntimeBrainContext
): { system: string; user: string } {
  const base = `你是双云行銷 AI 行銷部的「${ROLE_META[role].displayName}」。正在一場三腦會議中發言。\n客戶：${client.name}（${client.industry}）\n任務：${title}\n\n請針對這個任務，從你的專業角度提出 2-3 個關鍵建議。用繁體中文回答，簡潔扼要，150 字以內。`;

  let context = "";
  if (role === "strategy") {
    context = `你掌握的策略指令：\n${runtimeBrain.mergedDirectives.slice(0, 5).map((d, i) => `${i + 1}. ${d}`).join("\n")}`;
  } else if (role === "master") {
    const cases = runtimeBrain.relevantCases.slice(0, 3).map(c => `- ${c.caseId}: ${clipText(c.summary, 80)}`).join("\n");
    context = `你累積的案例經驗：\n${cases || "（無命中案例）"}`;
  } else {
    const agents = Object.values(brandBrain.agents).map(a => `- ${a.role}: ${clipText(a.systemPrompt, 60)}`).join("\n");
    context = `品牌腦 Agent 約束：\n${agents}`;
  }

  return { system: base, user: context + "\n\n請發表你的開場建議。" };
}

function buildCrossExamPrompt(
  role: BrainMeetingRole,
  client: Client,
  title: string,
  previousMessages: Array<{ role: BrainMeetingRole; content: string }>
): { system: string; user: string } {
  const system = `你是双云行銷「${ROLE_META[role].displayName}」。現在是腦會議的交叉審查階段。\n客戶：${client.name}\n任務：${title}\n\n請閱讀其他腦的發言，從你的角度指出 1-2 個需要補充或修正的地方。簡潔扼要，100 字以內。`;
  const transcript = previousMessages.map(m =>
    `【${ROLE_META[m.role].displayName}】${m.content}`
  ).join("\n\n");

  return { system, user: `以下是開場階段各腦的發言：\n\n${transcript}\n\n請發表你的交叉審查意見。` };
}

function buildSynthesisPrompt(
  client: Client,
  title: string,
  allMessages: Array<{ role: BrainMeetingRole; phase: BrainMeetingPhase; content: string }>,
  brandBrain: BrandBrain
): { system: string; user: string } {
  const system = [
    "你是三腦會議的主持人。請根據以下所有腦的發言，合成最終結論。",
    "",
    "輸出嚴格 JSON，格式：",
    '{',
    '  "taskBrief": {',
    '    "angle": "一句話切入點",',
    '    "keyMessages": ["訊息1", "訊息2", "訊息3"],',
    '    "toneConstraints": ["約束1"],',
    '    "referenceCaseIds": [],',
    '    "avoidList": ["避免1"],',
    '    "masterPlaybookId": null',
    '  },',
    '  "report": {',
    '    "consensus": ["共識1"],',
    '    "divergence": ["分歧1"],',
    '    "openQuestions": ["待釐清1"],',
    '    "actionItems": ["行動1"]',
    '  }',
    '}',
    "",
    "不要 markdown，不要額外說明，只回 JSON。"
  ].join("\n");

  const transcript = allMessages.map(m =>
    `【${ROLE_META[m.role].displayName} · ${m.phase}】${m.content}`
  ).join("\n\n");

  const bannedTopics = brandBrain.strategyNotes
    .filter(n => n.toLowerCase().includes("禁") || n.toLowerCase().includes("避免"))
    .slice(0, 5);

  const user = [
    `客戶：${client.name}（${client.industry}）`,
    `任務：${title}`,
    bannedTopics.length ? `品牌禁區：${bannedTopics.join("、")}` : "",
    "",
    "=== 會議記錄 ===",
    transcript,
    "",
    "請合成最終 JSON。"
  ].filter(Boolean).join("\n");

  return { system, user };
}

function safeParseSynthesis(raw: string): { taskBrief: TaskBrief; report: BrainConsultationReport } | null {
  try {
    const startIndex = raw.indexOf("{");
    const endIndex = raw.lastIndexOf("}");
    if (startIndex === -1 || endIndex === -1) return null;
    const parsed = JSON.parse(raw.slice(startIndex, endIndex + 1));
    if (!parsed.taskBrief?.angle || !parsed.report?.consensus) return null;
    return {
      taskBrief: {
        angle: parsed.taskBrief.angle,
        keyMessages: parsed.taskBrief.keyMessages ?? [],
        toneConstraints: parsed.taskBrief.toneConstraints ?? [],
        referenceCaseIds: parsed.taskBrief.referenceCaseIds ?? [],
        avoidList: parsed.taskBrief.avoidList ?? [],
        masterPlaybookId: parsed.taskBrief.masterPlaybookId ?? null
      },
      report: {
        consensus: parsed.report.consensus ?? [],
        divergence: parsed.report.divergence ?? [],
        openQuestions: parsed.report.openQuestions ?? [],
        actionItems: parsed.report.actionItems ?? []
      }
    };
  } catch {
    return null;
  }
}

export async function runBrainMeeting(
  client: Client,
  title: string,
  brandBrain: BrandBrain,
  runtimeBrain: RuntimeBrainContext,
  repositories: RepositoryBundle,
  mode: BrainMeetingMode,
  onMessage?: OnMessageCallback,
  externalMeetingId?: string
): Promise<BrainMeetingResult> {
  const meetingId = externalMeetingId ?? randomUUID();
  const messages: BrainMeetingMessage[] = [];
  const costSummary = { estimatedUsd: 0, inputTokens: 0, outputTokens: 0 };
  let fallbackUsed = false;
  const roles: BrainMeetingRole[] = ["strategy", "master", "brand"];

  // 只有沒有外部 ID 時才建 meeting 記錄（避免重複建立）
  if (!externalMeetingId && repositories.brainMeetings) {
    const meeting: BrainMeeting = {
      meetingId,
      clientId: client.clientId,
      mode,
      status: "running",
      startedAt: nowIso()
    };
    repositories.brainMeetings.create(meeting);
  }

  // === Phase 1: 開場 ===
  const openingResults: Array<{ role: BrainMeetingRole; content: string }> = [];
  for (const role of roles) {
    try {
      const prompts = buildOpeningPrompt(role, client, title, brandBrain, runtimeBrain);
      const result = await callClaudeWithUsageCheap({ system: prompts.system, user: prompts.user });
      costSummary.estimatedUsd += (result.inputTokens / 1_000_000) * 0.25 + (result.outputTokens / 1_000_000) * 1.25;
      costSummary.inputTokens += result.inputTokens;
      costSummary.outputTokens += result.outputTokens;

      const msg: BrainMeetingMessage = {
        id: randomUUID(),
        meetingId,
        role,
        round: 1,
        phase: "opening",
        content: result.text,
        createdAt: nowIso()
      };
      messages.push(msg);
      openingResults.push({ role, content: result.text });

      if (repositories.brainMeetingMessages) {
        repositories.brainMeetingMessages.create(msg);
      }

      onMessage?.({
        phase: "opening",
        role,
        displayName: ROLE_META[role].displayName,
        icon: ROLE_META[role].icon,
        content: result.text,
        round: 1,
        isLast: false
      });
    } catch (error) {
      const errorContent = `（${ROLE_META[role].displayName}暫時無法發言）`;
      const msg: BrainMeetingMessage = {
        id: randomUUID(),
        meetingId,
        role,
        round: 1,
        phase: "opening",
        content: errorContent,
        errorCode: error instanceof Error ? error.message.slice(0, 100) : "UNKNOWN",
        createdAt: nowIso()
      };
      messages.push(msg);
      openingResults.push({ role, content: errorContent });
      fallbackUsed = true;

      onMessage?.({
        phase: "opening",
        role,
        displayName: ROLE_META[role].displayName,
        icon: ROLE_META[role].icon,
        content: errorContent,
        round: 1,
        isLast: false
      });
    }
  }

  // === Phase 2: 交叉審查 ===
  const crossResults: Array<{ role: BrainMeetingRole; content: string }> = [];
  for (const role of roles) {
    try {
      const prompts = buildCrossExamPrompt(role, client, title, openingResults);
      const result = await callClaudeWithUsageCheap({ system: prompts.system, user: prompts.user });
      costSummary.inputTokens += result.inputTokens;
      costSummary.outputTokens += result.outputTokens;

      const msg: BrainMeetingMessage = {
        id: randomUUID(),
        meetingId,
        role,
        round: 2,
        phase: "cross_exam",
        content: result.text,
        createdAt: nowIso()
      };
      messages.push(msg);
      crossResults.push({ role, content: result.text });

      if (repositories.brainMeetingMessages) {
        repositories.brainMeetingMessages.create(msg);
      }

      onMessage?.({
        phase: "cross_exam",
        role,
        displayName: ROLE_META[role].displayName,
        icon: ROLE_META[role].icon,
        content: result.text,
        round: 2,
        isLast: false
      });
    } catch {
      const errorContent = `（${ROLE_META[role].displayName}交叉審查階段暫時無法發言）`;
      const msg: BrainMeetingMessage = {
        id: randomUUID(),
        meetingId,
        role,
        round: 2,
        phase: "cross_exam",
        content: errorContent,
        errorCode: "CROSS_EXAM_FAILED",
        createdAt: nowIso()
      };
      messages.push(msg);
      crossResults.push({ role, content: errorContent });
      fallbackUsed = true;

      onMessage?.({
        phase: "cross_exam",
        role,
        displayName: ROLE_META[role].displayName,
        icon: ROLE_META[role].icon,
        content: errorContent,
        round: 2,
        isLast: false
      });
    }
  }

  // === Phase 3: 彙整 ===
  const allTranscript = [
    ...openingResults.map(m => ({ ...m, phase: "opening" as BrainMeetingPhase })),
    ...crossResults.map(m => ({ ...m, phase: "cross_exam" as BrainMeetingPhase }))
  ];

  let taskBrief: TaskBrief;
  let report: BrainConsultationReport;

  try {
    const prompts = buildSynthesisPrompt(client, title, allTranscript, brandBrain);
    const result = await callClaudeWithUsageCheap({ system: prompts.system, user: prompts.user });
    costSummary.inputTokens += result.inputTokens;
    costSummary.outputTokens += result.outputTokens;

    const parsed = safeParseSynthesis(result.text);
    if (parsed) {
      taskBrief = parsed.taskBrief;
      report = parsed.report;
    } else {
      fallbackUsed = true;
      taskBrief = buildFallbackBrief(client, title, runtimeBrain);
      report = buildFallbackReport(openingResults, crossResults);
    }

    const msg: BrainMeetingMessage = {
      id: randomUUID(),
      meetingId,
      role: "strategy",
      round: 3,
      phase: "synthesis",
      content: result.text,
      createdAt: nowIso()
    };
    messages.push(msg);
    if (repositories.brainMeetingMessages) {
      repositories.brainMeetingMessages.create(msg);
    }

    onMessage?.({
      phase: "synthesis",
      role: "strategy",
      displayName: "會議主持",
      icon: "📋",
      content: parsed
        ? `共識：${report.consensus.join("、")}\n分歧：${report.divergence.join("、")}`
        : "（彙整 fallback）",
      round: 3,
      isLast: true
    });
  } catch {
    fallbackUsed = true;
    taskBrief = buildFallbackBrief(client, title, runtimeBrain);
    report = buildFallbackReport(openingResults, crossResults);

    onMessage?.({
      phase: "synthesis",
      role: "strategy",
      displayName: "會議主持",
      icon: "📋",
      content: "（彙整失敗，使用 fallback）",
      round: 3,
      isLast: true
    });
  }

  // 更新 meeting 狀態
  if (repositories.brainMeetings) {
    repositories.brainMeetings.updateStatus(meetingId, fallbackUsed ? "done" : "done", nowIso());
  }

  return { meetingId, taskBrief, report, messages, costSummary, fallbackUsed };
}

function buildFallbackBrief(client: Client, title: string, runtimeBrain: RuntimeBrainContext): TaskBrief {
  return {
    angle: `為 ${client.name} 的「${title}」任務產出客戶專屬內容`,
    keyMessages: [title, "符合品牌腦約束", "可直接交付"],
    toneConstraints: ["專業", "品牌一致性"],
    referenceCaseIds: runtimeBrain.relevantCases.slice(0, 2).map(c => c.caseId),
    avoidList: ["避免誇大承諾", "避免競品比較", "避免未經驗證的數據"],
    masterPlaybookId: runtimeBrain.masterPlaybooks[0]?.playbookId ?? null
  };
}

function buildFallbackReport(
  opening: Array<{ role: BrainMeetingRole; content: string }>,
  cross: Array<{ role: BrainMeetingRole; content: string }>
): BrainConsultationReport {
  return {
    consensus: opening.filter(m => !m.content.startsWith("（")).map(m => clipText(m.content, 60)),
    divergence: cross.filter(m => !m.content.startsWith("（")).map(m => clipText(m.content, 60)),
    openQuestions: ["需進一步確認品牌調性"],
    actionItems: ["根據腦會議結論執行任務"]
  };
}
