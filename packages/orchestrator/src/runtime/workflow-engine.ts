/**
 * 工作流執行引擎 — DAG 拓撲排序 + 逐步執行 + 腦/手節點執行器。
 *
 * 腦節點：載入品牌腦 + 上游輸出 + 歷史數據 → Claude API → 策略指令
 * 手節點：載入 Skill prompt + 上游輸出 → Claude API → 內容產出
 * 腦↔腦連線 = 討論（上游腦輸出注入下游腦 prompt）
 */

import { randomUUID } from "node:crypto";
import type {
  Client,
  SkillManifest,
  Task,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowExecution,
  WorkflowExecutionStep,
  WorkflowNode
} from "@shuangyun/shared-types";
import { callClaudeWithUsageCheap } from "../integrations/anthropic.js";
import type { RepositoryBundle } from "../repositories/bundle.js";
import { assembleCommand, formatCommandAsPrompt, type FeedbackRecord } from "./command-assembler.js";
import { parseActions, executeActions } from "../connectors/index.js";
import { resolveReferences } from "./reference-injection.js";

const MAX_NODES = 10;
const EXECUTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 分鐘

export class CycleDetectedError extends Error {
  constructor() { super("工作流含有循環，無法執行。"); this.name = "CycleDetectedError"; }
}

export class TooManyNodesError extends Error {
  constructor(count: number) { super(`工作流節點數 ${count} 超過上限 ${MAX_NODES}。`); this.name = "TooManyNodesError"; }
}

type StepOutput = {
  nodeId: string;
  type: string;
  content: string;
  costInputTokens: number;
  costOutputTokens: number;
  costEstimatedUsd: number;
  error?: string;
};

/**
 * 拓撲排序 — 回傳有序 nodeId[]，偵測環。
 */
export function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    inDegree.set(node.nodeId, 0);
    adj.set(node.nodeId, []);
  }
  for (const edge of edges) {
    adj.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    // 取出所有 inDegree=0 的（同層可並行）
    const current = queue.shift()!;
    sorted.push(current);
    for (const next of adj.get(current) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  if (sorted.length !== nodes.length) {
    throw new CycleDetectedError();
  }
  return sorted;
}

/**
 * 取得節點的所有上游輸出。
 */
function getUpstreamOutputs(nodeId: string, edges: WorkflowEdge[], outputsMap: Map<string, StepOutput>): StepOutput[] {
  return edges
    .filter(e => e.to === nodeId)
    .map(e => outputsMap.get(e.from))
    .filter((o): o is StepOutput => o !== undefined);
}

/**
 * 執行腦節點 — 從品牌資料庫讀取真實文件，組裝具體指令。
 * 規則充足時 0 token；需要 AI 判斷時可 fallback 到 AI call。
 */
function executeBrainNode(
  node: WorkflowNode,
  upstreamOutputs: StepOutput[],
  repositories: RepositoryBundle,
  _workflowId: string
): StepOutput {
  const brainType = node.brainConfig?.brainType ?? "strategy";
  const clientId = node.brainConfig?.clientId ?? "";
  const customPrompt = node.brainConfig?.prompt ?? "";
  const client = clientId ? repositories.clients.getById(clientId) : null;

  // ── 1. 讀取品牌資料庫的真實文件 ──
  const docs = clientId ? repositories.brandDataroom.listByClientId(clientId) : [];
  const docMap = new Map<string, string>();
  for (const doc of docs) {
    docMap.set(doc.docType, doc.content);
  }

  // ── 2. 讀取品牌腦（如果有），替換 {{ref:xxx}} 佔位符 ──
  const brandBrain = clientId ? repositories.brandBrains.getByClientId(clientId) : null;
  let resolvedPrompts = "";
  if (brandBrain) {
    const resolved = resolveReferences(brandBrain, { type: "content" }, repositories.brandDataroom);
    resolvedPrompts = Object.values(resolved.agents).map(a =>
      `【${a.role} Agent】\n${a.systemPrompt}`
    ).join("\n\n---\n\n");
  }

  // ── 3. 組裝指令內容 ──
  const parts: string[] = [];

  // 腦類型標題
  if (brainType === "strategy") {
    parts.push("## 双云策略腦指令");
    parts.push("方法論：SOSTAC（現況→目標→策略→戰術→行動→管控）");
    parts.push("原則：專業簡潔、數據驅動、客戶導向");
  } else if (brainType === "master") {
    parts.push("## 師傅腦指令");
    const cases = repositories.masterCases.listAll().slice(0, 3);
    if (cases.length > 0) {
      parts.push("### 相關案例經驗");
      for (const c of cases) {
        parts.push(`- 【${c.industry}】${c.summary}（重點：${c.takeaway}）`);
      }
    }
  } else if (brainType === "brand") {
    parts.push(`## 品牌腦指令 — ${client?.name ?? clientId}`);
    if (client) {
      parts.push(`產業：${client.industry}`);
    }
  }

  // 品牌知識（已替換佔位符的真實內容）
  if (resolvedPrompts) {
    parts.push("", "### 品牌知識", resolvedPrompts);
  }

  // 品牌策略筆記
  if (brandBrain?.strategyNotes.length) {
    parts.push("", "### 品牌策略筆記");
    for (const note of brandBrain.strategyNotes) {
      parts.push(`- ${note}`);
    }
  }

  // 直接注入文件原文（給下游 Skill 用）
  if (docMap.size > 0 && !resolvedPrompts) {
    parts.push("", "### 品牌文件原文");
    for (const [docType, content] of docMap) {
      parts.push(`\n#### ${docType}`, content.slice(0, 2000));
    }
  }

  // 自訂 prompt
  if (customPrompt) {
    parts.push("", "### 額外策略指令", customPrompt);
  }

  // 上游輸出
  if (upstreamOutputs.length > 0) {
    parts.push("", "### 上游節點產出");
    for (const o of upstreamOutputs) {
      parts.push(`【${o.type === "brain" ? "腦" : "手"} · ${o.nodeId}】`);
      parts.push(o.content.slice(0, 800));
    }
  }

  // 歷史回饋
  if (clientId && repositories.feedbackHistory) {
    const history = repositories.feedbackHistory.listRecent(clientId, "content", 3);
    if (history.length > 0) {
      parts.push("", "### 歷史回饋（供優化參考）");
      for (const h of history) {
        const scoreText = h.score !== null ? `（評分 ${h.score}）` : "";
        parts.push(`- ${h.outputSummary.slice(0, 80)}${scoreText}`);
        if (h.userEdits) parts.push(`  客戶回饋：${h.userEdits}`);
      }
    }
  }

  return {
    nodeId: node.nodeId,
    type: "brain",
    content: parts.join("\n"),
    costInputTokens: 0,
    costOutputTokens: 0,
    costEstimatedUsd: 0
  };
}

/**
 * 執行手節點（Skill）— 花 1 AI call。
 * 接收上游腦的品牌知識+指令，注入 Skill prompt 執行。
 */
async function executeSkillNode(
  node: WorkflowNode,
  upstreamOutputs: StepOutput[],
  repositories: RepositoryBundle
): Promise<StepOutput> {
  const skill = node.skillId ? repositories.skills.findById(node.skillId) : null;
  const skillPrompt = skill
    ? skill.blocks.find(b => b.type === "skill")?.systemPrompt ?? `你是 ${skill.name}，請根據上游指令執行任務。`
    : `你是行銷執行手，請根據上游指令執行任務。`;

  // 分離上游的「腦指令」和「手產出」
  const brainCommands = upstreamOutputs.filter(o => o.type === "brain");
  const handOutputs = upstreamOutputs.filter(o => o.type === "skill");

  // 腦指令注入 system prompt（品牌知識+約束+策略）
  const brainContext = brainCommands.length > 0
    ? "\n\n---\n\n【腦指令 — 必須嚴格遵守以下品牌約束與策略方向】\n\n" + brainCommands.map(o => o.content).join("\n\n")
    : "";

  // 手產出作為參考
  const handContext = handOutputs.length > 0
    ? handOutputs.map(o => `【上游 ${o.nodeId} 的產出（供參考）】\n${o.content.slice(0, 500)}`).join("\n\n")
    : "";

  const systemWithBrain = skillPrompt + brainContext;

  const userPrompt = [
    skill ? `任務：使用「${skill.name}」Skill 產出內容` : "請執行任務",
    handContext ? `\n## 上游產出\n${handContext}` : "",
    "\n請嚴格遵守腦指令中的品牌約束、語調、禁區，產出一份可直接交付的繁體中文內容。",
    "內容需包含：標題 / 內容主體 / CTA 或結尾。"
  ].filter(Boolean).join("\n");

  try {
    // 階段 1：Claude 產文 + action 標記
    const result = await callClaudeWithUsageCheap({ system: systemWithBrain, user: userPrompt });
    let totalCost = (result.inputTokens / 1_000_000) * 0.25 + (result.outputTokens / 1_000_000) * 1.25;
    let finalContent = result.text;
    const assetUrls: string[] = [];

    // 階段 2：解析 action 標記 → 呼叫 Connector
    const actions = parseActions(result.text);
    if (actions.length > 0) {
      const connectorResults = await executeActions(actions, node.brainConfig?.clientId);
      for (const cr of connectorResults) {
        totalCost += cr.costUsd;
        if (cr.success) {
          if (cr.outputType === "image_url" || cr.outputType === "video_url" || cr.outputType === "file_url") {
            assetUrls.push(cr.content);
            finalContent += `\n\n[${cr.connectorId} 產出] ${cr.content}`;
          } else if (cr.outputType === "post_url") {
            finalContent += `\n\n[已發佈] ${cr.content}`;
          } else {
            finalContent += `\n\n[${cr.connectorId}] ${cr.content}`;
          }
        } else {
          finalContent += `\n\n[${cr.connectorId} 失敗] ${cr.content}`;
        }
      }
    }

    return {
      nodeId: node.nodeId, type: "skill", content: finalContent,
      costInputTokens: result.inputTokens, costOutputTokens: result.outputTokens,
      costEstimatedUsd: totalCost
    };
  } catch (err) {
    return {
      nodeId: node.nodeId, type: "skill", content: "",
      costInputTokens: 0, costOutputTokens: 0, costEstimatedUsd: 0,
      error: err instanceof Error ? err.message : "手節點執行失敗"
    };
  }
}

/**
 * 執行整個工作流。
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
  repositories: RepositoryBundle
): Promise<{ executionId: string; steps: StepOutput[] }> {
  if (workflow.nodes.length > MAX_NODES) {
    throw new TooManyNodesError(workflow.nodes.length);
  }

  const sorted = topologicalSort(workflow.nodes, workflow.edges);
  const nodesMap = new Map(workflow.nodes.map(n => [n.nodeId, n]));
  const outputsMap = new Map<string, StepOutput>();
  const executionId = randomUUID();
  const startedAt = new Date().toISOString();

  // 建立執行記錄
  repositories.workflowExecutions.create({
    executionId,
    workflowId: workflow.workflowId,
    status: "running",
    startedAt,
    totalCostUsd: 0
  });

  const allSteps: StepOutput[] = [];
  let totalCost = 0;
  const deadline = Date.now() + EXECUTION_TIMEOUT_MS;

  // 按拓撲順序分層執行（同層並行）
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of workflow.nodes) { inDegree.set(n.nodeId, 0); adj.set(n.nodeId, []); }
  for (const e of workflow.edges) { adj.get(e.from)?.push(e.to); inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1); }

  const remaining = new Set(sorted);

  while (remaining.size > 0) {
    if (Date.now() > deadline) {
      repositories.workflowExecutions.updateStatus(executionId, "timeout", new Date().toISOString(), totalCost);
      break;
    }

    // 找出當前可執行的節點（inDegree = 0 且在 remaining 中）
    const ready = [...remaining].filter(id => (inDegree.get(id) ?? 0) === 0);
    if (ready.length === 0) break; // 不應發生（已通過拓撲排序）

    // 並行執行
    const results = await Promise.allSettled(ready.map(async nodeId => {
      const node = nodesMap.get(nodeId)!;
      const upstreamOutputs = getUpstreamOutputs(nodeId, workflow.edges, outputsMap);

      // 建立 step 記錄
      const stepId = randomUUID();
      const stepStart = new Date().toISOString();
      repositories.workflowExecutionSteps.create({
        stepId, executionId, nodeId, status: "running",
        inputJson: JSON.stringify(upstreamOutputs.map(o => ({ nodeId: o.nodeId, content: o.content.slice(0, 500) }))),
        outputJson: "{}", costInputTokens: 0, costOutputTokens: 0, costEstimatedUsd: 0,
        startedAt: stepStart
      });

      let output: StepOutput;
      if (node.type === "brain") {
        output = await executeBrainNode(node, upstreamOutputs, repositories, workflow.workflowId);
      } else {
        output = await executeSkillNode(node, upstreamOutputs, repositories);
      }

      // 更新 step
      const stepEnd = new Date().toISOString();
      repositories.workflowExecutionSteps.updateStatus(
        stepId,
        output.error ? "error" : "done",
        JSON.stringify({ content: output.content }),
        stepEnd,
        output.error,
        output.costInputTokens,
        output.costOutputTokens,
        output.costEstimatedUsd
      );

      return output;
    }));

    // 收集結果
    for (let i = 0; i < ready.length; i++) {
      const nodeId = ready[i]!;
      const result = results[i]!;
      let output: StepOutput;
      if (result.status === "fulfilled") {
        output = result.value;
      } else {
        output = {
          nodeId, type: nodesMap.get(nodeId)?.type ?? "skill", content: "",
          costInputTokens: 0, costOutputTokens: 0, costEstimatedUsd: 0,
          error: result.reason instanceof Error ? result.reason.message : "未知錯誤"
        };
      }
      outputsMap.set(nodeId, output);
      allSteps.push(output);
      totalCost += output.costEstimatedUsd;
      remaining.delete(nodeId);

      // 更新下游 inDegree
      for (const next of adj.get(nodeId) ?? []) {
        inDegree.set(next, (inDegree.get(next) ?? 1) - 1);
      }
    }
  }

  // 完成
  const endedAt = new Date().toISOString();
  const hasError = allSteps.some(s => s.error);
  repositories.workflowExecutions.updateStatus(executionId, hasError ? "error" : "done", endedAt, totalCost);

  return { executionId, steps: allSteps };
}
