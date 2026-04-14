/**
 * 工作流執行引擎 — Harness Architecture
 *
 * 三階段執行：
 * Phase 1：腦群討論 → 統一決策（所有腦節點一起討論，合成一份決策指令）
 * Phase 2：決策分發 → 手執行（每個手節點收到決策，獨立執行）
 * Phase 3：腦審核 → 通過/退回（可選，審核所有手的產出）
 *
 * Harness = 腦是駕馭者（統一方向），手是執行者（各拉各的）
 */

import { randomUUID } from "node:crypto";
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from "@shuangyun/shared-types";
import { callClaudeWithUsageCheap } from "../integrations/anthropic.js";
import { parseActions, executeActions } from "../connectors/index.js";
import type { RepositoryBundle } from "../repositories/bundle.js";

const MAX_NODES = 10;
const EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;

export class CycleDetectedError extends Error {
  constructor() { super("工作流含有循環，無法執行。"); this.name = "CycleDetectedError"; }
}
export class TooManyNodesError extends Error {
  constructor(count: number) { super(`節點數 ${count} 超過上限 ${MAX_NODES}。`); this.name = "TooManyNodesError"; }
}

type StepResult = {
  nodeId: string;
  type: "brain-discuss" | "brain-decision" | "hand" | "brain-review";
  label: string;
  content: string;
  cost: number;
  error?: string;
};

/**
 * Harness 執行引擎
 *
 * 不管 DAG 怎麼連，邏輯就是：
 * 1. 所有腦節點一起討論 → 產出統一決策
 * 2. 統一決策發給所有手節點 → 各自執行
 * 3. （可選）腦審核所有手的產出
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
  repositories: RepositoryBundle
): Promise<{ executionId: string; steps: StepResult[] }> {
  if (workflow.nodes.length > MAX_NODES) throw new TooManyNodesError(workflow.nodes.length);

  const executionId = randomUUID();
  const steps: StepResult[] = [];

  // 分類節點
  const brainNodes = workflow.nodes.filter(n => n.type === "brain");
  const handNodes = workflow.nodes.filter(n => n.type === "skill");

  // 取得品牌 context
  const clientId = workflow.clientId || brainNodes.find(n => n.brainConfig?.clientId)?.brainConfig?.clientId || "";
  const client = clientId ? repositories.clients.getById(clientId) : null;
  const clientContext = client ? `品牌：${client.name}（${client.industry}）` : "";

  // 記錄執行
  repositories.workflowExecutions.create({
    executionId, workflowId: workflow.workflowId,
    status: "running", startedAt: new Date().toISOString(), totalCostUsd: 0
  });

  let totalCost = 0;

  // ═══════════════════════════════════════════
  // Phase 1：腦群討論 → 統一決策
  // ═══════════════════════════════════════════
  let unifiedDecision = "";

  if (brainNodes.length > 0) {
    // 每個腦各自發言
    const brainOpinions: string[] = [];

    for (const brain of brainNodes) {
      const skill = brain.skillId ? repositories.skills.findById(brain.skillId) : null;
      const brainPrompt = skill?.blocks[0]?.systemPrompt ?? "";
      const brainName = skill?.name ?? brain.label ?? brain.nodeId;
      const customPrompt = brain.brainConfig?.prompt ?? "";

      try {
        const result = await callClaudeWithUsageCheap({
          system: [
            brainPrompt,
            clientContext ? `\n${clientContext}` : "",
            customPrompt ? `\n額外指令：${customPrompt}` : "",
            "\n你正在參與一場腦群討論。請從你的專業角度發表意見，200 字以內。"
          ].filter(Boolean).join(""),
          user: `任務：${workflow.name}\n\n請發表你的策略觀點和建議。`
        });
        const cost = (result.inputTokens / 1e6) * 0.25 + (result.outputTokens / 1e6) * 1.25;
        totalCost += cost;
        brainOpinions.push(`【${brainName}】\n${result.text}`);
        steps.push({ nodeId: brain.nodeId, type: "brain-discuss", label: `${brainName} 發言`, content: result.text, cost });
      } catch (err) {
        steps.push({ nodeId: brain.nodeId, type: "brain-discuss", label: `${brainName} 發言`, content: "", cost: 0, error: err instanceof Error ? err.message : "腦發言失敗" });
      }
    }

    // 合成統一決策
    if (brainOpinions.length > 0) {
      try {
        const synthPrompt = brainOpinions.length === 1
          ? brainOpinions[0]!
          : brainOpinions.join("\n\n---\n\n");

        const synthResult = await callClaudeWithUsageCheap({
          system: [
            "你是腦群討論的主持人。根據以下各腦的意見，合成一份統一的執行決策。",
            clientContext ? `\n${clientContext}` : "",
            "\n決策必須包含：",
            "1. 核心方向（一句話）",
            "2. 必須遵守的約束（3-5 條）",
            "3. 給每個執行手的具體指令",
            "\n直接輸出決策，不要解釋討論過程。"
          ].join(""),
          user: synthPrompt
        });
        const cost = (synthResult.inputTokens / 1e6) * 0.25 + (synthResult.outputTokens / 1e6) * 1.25;
        totalCost += cost;
        unifiedDecision = synthResult.text;
        steps.push({ nodeId: "decision", type: "brain-decision", label: "腦群統一決策", content: unifiedDecision, cost });
      } catch (err) {
        // fallback：直接用第一個腦的意見
        unifiedDecision = brainOpinions[0]?.replace(/^【[^】]+】\n/, "") ?? "";
        steps.push({ nodeId: "decision", type: "brain-decision", label: "腦群統一決策（fallback）", content: unifiedDecision, cost: 0, error: err instanceof Error ? err.message : "合成失敗" });
      }
    }
  }

  // ═══════════════════════════════════════════
  // Phase 2：決策分發 → 手執行（並行）
  // ═══════════════════════════════════════════
  if (handNodes.length > 0) {
    const handPromises = handNodes.map(async (hand) => {
      const skill = hand.skillId ? repositories.skills.findById(hand.skillId) : null;
      const handPrompt = skill?.blocks[0]?.systemPrompt ?? `你是行銷執行手，請根據指令執行任務。`;
      const handName = skill?.name ?? hand.label ?? hand.nodeId;

      // 組合 system prompt：Skill prompt + 腦決策
      const systemWithDecision = unifiedDecision
        ? `${handPrompt}\n\n---\n\n【腦群決策 — 必須嚴格遵守】\n${unifiedDecision}`
        : handPrompt;

      try {
        const result = await callClaudeWithUsageCheap({
          system: systemWithDecision,
          user: [
            `任務：${workflow.name}`,
            clientContext ? clientContext : "",
            "\n請根據腦群決策執行任務，產出完整繁體中文內容。",
            "內容需包含：標題 / 內容主體 / CTA 或結尾。"
          ].filter(Boolean).join("\n")
        });
        const cost = (result.inputTokens / 1e6) * 0.25 + (result.outputTokens / 1e6) * 1.25;

        // 檢查是否有 Connector action
        let finalContent = result.text;
        const actions = parseActions(result.text);
        if (actions.length > 0) {
          const connResults = await executeActions(actions, clientId);
          for (const cr of connResults) {
            if (cr.success) {
              finalContent += `\n\n[${cr.connectorId}] ${cr.content}`;
            }
          }
        }

        return { nodeId: hand.nodeId, type: "hand" as const, label: `${handName} 產出`, content: finalContent, cost };
      } catch (err) {
        return { nodeId: hand.nodeId, type: "hand" as const, label: `${handName} 產出`, content: "", cost: 0, error: err instanceof Error ? err.message : "手執行失敗" };
      }
    });

    const handResults = await Promise.all(handPromises);
    for (const r of handResults) {
      totalCost += r.cost;
      steps.push(r);
    }
  }

  // ═══════════════════════════════════════════
  // Phase 3：腦審核（如果有腦→手的回流邊）
  // ═══════════════════════════════════════════
  // 檢查是否有手→腦的邊（代表需要腦審核）
  const handOutputs = steps.filter(s => s.type === "hand" && !s.error).map(s => s.content).join("\n\n---\n\n");
  const hasReviewEdge = workflow.edges.some(e => {
    const from = workflow.nodes.find(n => n.nodeId === e.from);
    const to = workflow.nodes.find(n => n.nodeId === e.to);
    return from?.type === "skill" && to?.type === "brain";
  });

  if (hasReviewEdge && handOutputs && brainNodes.length > 0) {
    try {
      const reviewResult = await callClaudeWithUsageCheap({
        system: [
          "你是品質審核腦。根據腦群決策審核以下手的產出。",
          clientContext ? clientContext : "",
          "\n請給出：",
          "1. 整體評價（通過 / 需修改）",
          "2. 每個產出的具體評分（1-10）和修改建議",
          "3. 是否符合腦群決策的方向和約束"
        ].join(""),
        user: `【腦群決策】\n${unifiedDecision}\n\n【手產出】\n${handOutputs}`
      });
      const cost = (reviewResult.inputTokens / 1e6) * 0.25 + (reviewResult.outputTokens / 1e6) * 1.25;
      totalCost += cost;
      steps.push({ nodeId: "review", type: "brain-review", label: "腦群審核", content: reviewResult.text, cost });
    } catch (err) {
      steps.push({ nodeId: "review", type: "brain-review", label: "腦群審核", content: "", cost: 0, error: err instanceof Error ? err.message : "審核失敗" });
    }
  }

  // 完成
  repositories.workflowExecutions.updateStatus(executionId, "done", new Date().toISOString(), totalCost);
  return { executionId, steps };
}
