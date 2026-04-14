/**
 * 指令組裝器 — 替代 brain-meeting + brain-briefing，完全不呼叫 AI。
 *
 * 從三種腦文件提取規則 + 匹配歷史回饋 → 組裝出 SkillCommand。
 * 每任務 0 token。
 */

import type { Client, SkillManifest, Task } from "@shuangyun/shared-types";
import { parseBrainDoc, extractRules, type BrainRuleSet } from "./brain-doc-parser.js";

export type SkillCommand = {
  angle: string;
  keyMessages: string[];
  toneConstraints: string[];
  avoidList: string[];
  improvements: string[];
  referenceCases: string[];
};

export type FeedbackRecord = {
  outputSummary: string;
  score: number | null;
  userEdits: string | null;
  createdAt: string;
};

export type BrainDocsInput = {
  strategy: string; // 策略腦 .md 原文
  master: string;   // 師傅腦 .md 原文
  brand: string;    // 品牌腦 .md 原文
};

/**
 * 從歷史回饋推導改進指示。
 */
function deriveImprovements(history: FeedbackRecord[]): string[] {
  if (history.length === 0) return [];
  const improvements: string[] = [];

  const latest = history[0]!;
  if (latest.score !== null && latest.score < 60) {
    improvements.push("上次品質待改進（評分 " + latest.score + "），請加強內容深度與品牌一致性");
  }
  if (latest.userEdits) {
    improvements.push("客戶回饋：" + latest.userEdits.slice(0, 100));
  }

  const recentScores = history.filter(h => h.score !== null).map(h => h.score!);
  if (recentScores.length >= 3 && recentScores.every(s => s >= 80)) {
    improvements.push("近期品質穩定（連續高分），維持現有方向");
  }

  if (improvements.length === 0 && history.length > 0) {
    improvements.push("參考上次產出方向：" + latest.outputSummary.slice(0, 80));
  }

  return improvements;
}

/**
 * 組裝 Skill 執行指令 — 0 token。
 *
 * 從三種腦文件提取規則 + 匹配歷史 → 填入模板 → 回傳 SkillCommand。
 */
export function assembleCommand(
  task: Task,
  client: Client,
  brainDocs: BrainDocsInput,
  _skill: SkillManifest,
  history: FeedbackRecord[]
): SkillCommand {
  // 1. 策略腦：提取 task.type 對應的規則
  const strategyDoc = parseBrainDoc(brainDocs.strategy);
  const strategyRules = extractRules(strategyDoc, task.type);

  // 2. 師傅腦：提取案例經驗
  const masterDoc = parseBrainDoc(brainDocs.master);
  const masterRules = extractRules(masterDoc, task.type);

  // 3. 品牌腦：提取品牌約束
  const brandDoc = parseBrainDoc(brainDocs.brand);
  const brandRules = extractRules(brandDoc, task.type);

  // 4. 歷史回饋 → 改進指示
  const improvements = deriveImprovements(history);

  // 5. 合併三腦規則，組裝指令
  return {
    angle: strategyRules.angle || brandRules.angle || `為 ${client.name} 產出 ${task.type} 內容`,
    keyMessages: dedup([
      ...strategyRules.mustInclude,
      ...brandRules.mustInclude,
      ...masterRules.mustInclude
    ]),
    toneConstraints: dedup([
      ...brandRules.tone,
      ...strategyRules.tone
    ]),
    avoidList: dedup([
      ...brandRules.banned,
      ...strategyRules.banned,
      ...masterRules.banned
    ]),
    improvements,
    referenceCases: dedup([
      ...masterRules.referenceCases,
      ...strategyRules.referenceCases
    ])
  };
}

function dedup(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))];
}

/**
 * 將 SkillCommand 格式化為 Claude system prompt 的一部分。
 */
export function formatCommandAsPrompt(cmd: SkillCommand, client: Client): string {
  const parts: string[] = [
    `## 指令摘要（由腦文件組裝，非 AI 生成）`,
    `客戶：${client.name}（${client.industry}）`,
    `切入角度：${cmd.angle}`,
    "",
    `### 必要訊息點`,
    ...cmd.keyMessages.map((m, i) => `${i + 1}. ${m}`),
    "",
    `### 語調約束`,
    ...cmd.toneConstraints.map(t => `- ${t}`),
    "",
    `### 絕對禁區`,
    ...cmd.avoidList.map(a => `- ❌ ${a}`),
  ];

  if (cmd.referenceCases.length > 0) {
    parts.push("", `### 參考案例`, ...cmd.referenceCases.map(c => `- ${c}`));
  }

  if (cmd.improvements.length > 0) {
    parts.push("", `### 歷史回饋改進指示`, ...cmd.improvements.map(imp => `- ⚡ ${imp}`));
  }

  return parts.join("\n");
}
