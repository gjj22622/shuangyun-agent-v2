import type { BrandBrain, BrandBrainAgent } from "@shuangyun/shared-types";
import type { CommitteeReview, MasterCase, Playbook } from "@shuangyun/shared-types";
import { createNoopMasterBrain, type MasterBrain, type MasterBrainTaskAttrs } from "./master-brain.js";

export type StrategyBrain = {
  strategyId: string;
  version: number;
  directives: string[];
};

export type RuntimeBrainContext = {
  clientId: string;
  strategyId: string;
  mergedDirectives: string[];
  committeePrompts: Record<BrandBrainAgent["role"], string>;
  masterPlaybooks: Playbook[];
  relevantCases: MasterCase[];
};

export function createStrategyBrain(directives: string[]): StrategyBrain {
  return {
    strategyId: "strategy-brain-default",
    version: 1,
    directives
  };
}

function formatMasterPlaybookDirective(playbook: Playbook): string {
  return `師傅腦劇本 ${playbook.name}：${playbook.steps.join(" / ")}`;
}

function formatRelevantCaseDirective(masterCase: MasterCase): string {
  return `師傅腦案例 ${masterCase.caseId}：${masterCase.summary}｜萃取：${masterCase.takeaway}`;
}

function parseTaskAttrs(strategy: StrategyBrain, brandBrain: BrandBrain): {
  industry?: string;
  channel?: string;
  tags?: string[];
} {
  const attrs: {
    industry?: string;
    channel?: string;
    tags?: string[];
  } = {};

  for (const directive of [...strategy.directives, ...brandBrain.strategyNotes]) {
    if (directive.startsWith("industry=")) {
      attrs.industry = directive.slice("industry=".length).trim();
      continue;
    }

    if (directive.startsWith("channel=")) {
      attrs.channel = directive.slice("channel=".length).trim();
      continue;
    }

    if (directive.startsWith("tags=")) {
      attrs.tags = directive
        .slice("tags=".length)
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  }

  return attrs;
}

export function mergeThreeBrains(
  strategy: StrategyBrain,
  masterBrain: MasterBrain,
  brandBrain: BrandBrain,
  explicitAttrs?: MasterBrainTaskAttrs
): RuntimeBrainContext {
  // 優先使用 dispatch 層傳入的 taskAttrs（來自 task + client），
  // 否則 fallback 從 directives 中解析 key=value 格式（現有機制）
  const taskAttrs = explicitAttrs ?? parseTaskAttrs(strategy, brandBrain);
  const relevantCases = masterBrain.recallCases(taskAttrs, 5);
  const masterPlaybooks = masterBrain.recallPlaybooks(taskAttrs, 3);

  return {
    clientId: brandBrain.clientId,
    strategyId: strategy.strategyId,
    mergedDirectives: [
      ...strategy.directives,
      ...brandBrain.strategyNotes,
      ...masterPlaybooks.map(formatMasterPlaybookDirective),
      ...relevantCases.map(formatRelevantCaseDirective)
    ],
    committeePrompts: {
      boss: brandBrain.agents.boss.systemPrompt,
      manager: brandBrain.agents.manager.systemPrompt,
      window: brandBrain.agents.window.systemPrompt,
      brand: brandBrain.agents.brand.systemPrompt
    },
    masterPlaybooks,
    relevantCases
  };
}

export function mergeBrains(
  strategy: StrategyBrain,
  masterOrBrandBrain: MasterBrain | BrandBrain,
  maybeBrandBrain?: BrandBrain
): RuntimeBrainContext {
  if (maybeBrandBrain) {
    return mergeThreeBrains(strategy, masterOrBrandBrain as MasterBrain, maybeBrandBrain);
  }

  return mergeThreeBrains(strategy, createNoopMasterBrain(), masterOrBrandBrain as BrandBrain);
}

export type CommitteeScoreInput = {
  boss: { score: number; note: string };
  manager: { score: number; note: string };
  window: { score: number; note: string };
  brand: { score: number; note: string };
};

export function evaluateCommitteeReview(input: CommitteeScoreInput): CommitteeReview {
  const { boss, manager, window: win, brand } = input;
  const scores = [boss.score, manager.score, win.score, brand.score];
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const otherAvg = (manager.score + win.score + brand.score) / 3;
  const overallAvg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const normalizedOverallAvg = Math.round(overallAvg);
  const bossVeto = boss.score < 4;

  let verdict: CommitteeReview["verdict"];
  if (bossVeto) {
    verdict = otherAvg >= 7 ? "major_rework" : "reject";
  } else if (normalizedOverallAvg >= 8) {
    verdict = "pass";
  } else if (normalizedOverallAvg >= 6) {
    verdict = "minor_tweak";
  } else if (normalizedOverallAvg >= 4) {
    verdict = "major_rework";
  } else {
    verdict = "reject";
  }

  const variance = maxScore - minScore;
  const confidence = Math.max(0, Math.min(100, Math.round(100 - variance * 10)));

  return {
    bossScore: boss.score,
    bossNote: boss.note,
    managerScore: manager.score,
    managerNote: manager.note,
    windowScore: win.score,
    windowNote: win.note,
    brandScore: brand.score,
    brandNote: brand.note,
    verdict,
    confidence,
    reasoningTrace:
      `boss_veto=${bossVeto};other_avg=${otherAvg.toFixed(2)};overall_avg=${overallAvg.toFixed(2)};normalized_avg=${normalizedOverallAvg};` +
      `variance=${variance};verdict=${verdict}`
  };
}

export { createNoopMasterBrain, loadMasterBrain, type MasterBrain, type MasterBrainTaskAttrs } from "./master-brain.js";
