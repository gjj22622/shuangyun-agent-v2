/**
 * Reference Injection — 執行時將品牌腦的 {{ref:docType}} 佔位符替換為文件原文。
 * 純本地運算（字串替換 + DB 查詢），不花 token。
 */

import type { BrandBrain, BrandDataroomDoc, ContextRule } from "@shuangyun/shared-types";

type DataroomReader = {
  listByClientId(clientId: string): BrandDataroomDoc[];
};

type TaskLike = {
  type: string;
  [key: string]: unknown;
};

const PLACEHOLDER_REGEX = /\{\{ref:(\w+)\}\}/g;

/**
 * 根據 contextRules 和 task 屬性，決定要注入哪些 docType。
 * 無匹配時 fallback 到 agent 的 dataroomRefs。
 */
function resolveInjectDocs(
  contextRules: ContextRule[],
  dataroomRefs: string[],
  task: TaskLike
): ContextRule["inject"] {
  if (!contextRules || contextRules.length === 0) {
    return dataroomRefs.map(dt => ({ docType: dt }));
  }

  for (const rule of contextRules) {
    const w = rule.when;
    const matches =
      (!w.taskType || w.taskType.length === 0 || w.taskType.includes(task.type)) &&
      (!w.channel || w.channel.length === 0 || w.channel.includes(String(task.channel ?? ""))) &&
      (!w.keyword || w.keyword.length === 0 || w.keyword.some(kw => JSON.stringify(task).includes(kw)));

    if (matches) {
      return rule.inject;
    }
  }

  // 無匹配：fallback 到 dataroomRefs
  return dataroomRefs.map(dt => ({ docType: dt }));
}

/**
 * 將 prompt 中的 {{ref:docType}} 替換為文件原文。
 */
function replacePlaceholders(
  prompt: string,
  docsMap: Map<string, string>,
  injectSpecs: ContextRule["inject"]
): string {
  // 建立 maxChars 對照表
  const maxCharsMap = new Map<string, number>();
  for (const spec of injectSpecs) {
    if (spec.maxChars) maxCharsMap.set(spec.docType, spec.maxChars);
  }

  return prompt.replace(PLACEHOLDER_REGEX, (_match, docType: string) => {
    const content = docsMap.get(docType);
    if (!content) {
      return `（尚未上傳 ${docType} 文件）`;
    }
    const maxChars = maxCharsMap.get(docType);
    if (maxChars && content.length > maxChars) {
      return content.slice(0, maxChars) + "...（截斷）";
    }
    return content;
  });
}

/**
 * 解析品牌腦的所有 agent prompt，替換佔位符為文件原文。
 * 向後相容：不含佔位符的 prompt 原封不動回傳。
 */
export function resolveReferences(
  brandBrain: BrandBrain,
  task: TaskLike,
  dataroomReader: DataroomReader
): BrandBrain {
  // 如果所有 agent prompt 都不含佔位符，直接回傳（向後相容）
  const allPrompts = Object.values(brandBrain.agents).map(a => a.systemPrompt).join("");
  if (!PLACEHOLDER_REGEX.test(allPrompts)) {
    // 重置 lastIndex（regex 帶 /g flag）
    PLACEHOLDER_REGEX.lastIndex = 0;
    return brandBrain;
  }
  PLACEHOLDER_REGEX.lastIndex = 0;

  // 載入所有文件
  const docs = dataroomReader.listByClientId(brandBrain.clientId);
  const docsMap = new Map<string, string>();
  for (const doc of docs) {
    // 同一 docType 可能有多份，取最新的（最後一筆）
    docsMap.set(doc.docType, doc.content);
  }

  // 深拷貝 agents 並替換
  const resolvedAgents: BrandBrain["agents"] = {} as BrandBrain["agents"];
  for (const [role, agent] of Object.entries(brandBrain.agents)) {
    const injectSpecs = resolveInjectDocs(
      agent.contextRules ?? [],
      agent.dataroomRefs,
      task
    );
    resolvedAgents[role as keyof BrandBrain["agents"]] = {
      ...agent,
      systemPrompt: replacePlaceholders(agent.systemPrompt, docsMap, injectSpecs)
    };
  }

  return {
    ...brandBrain,
    agents: resolvedAgents
  };
}
