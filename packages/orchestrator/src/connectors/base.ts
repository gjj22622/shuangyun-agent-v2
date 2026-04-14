/**
 * Connector 抽象介面 — 所有外部工具（產圖/產影片/社群/廣告）的統一介面。
 */

import type { ConnectorCategory, ConnectorInput, ConnectorResult } from "@shuangyun/shared-types";

export interface Connector {
  readonly id: string;
  readonly category: ConnectorCategory;
  readonly name: string;
  readonly requiredEnvKeys: string[];

  isAvailable(): boolean;
  execute(input: ConnectorInput): Promise<ConnectorResult>;
  estimateCost(input: ConnectorInput): number;
}

/**
 * 解析 Skill 產出中的 action 標記。
 * 格式：
 * ## actions
 * - action: generate_image
 *   connector: dall-e
 *   prompt: 描述文字
 *   params:
 *     size: 1024x1024
 */
export type ParsedAction = {
  action: string;
  connector: string;
  prompt: string;
  params: Record<string, string>;
};

export function parseActions(text: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  // 找到 ## actions 區塊
  const actionsMatch = text.match(/## actions\s*\n([\s\S]*?)(?=\n## |\n$|$)/i);
  if (!actionsMatch) return actions;

  const block = actionsMatch[1] ?? "";
  // 分割每個 - action:
  const chunks = block.split(/^- action:/m).filter(Boolean);

  for (const chunk of chunks) {
    const lines = chunk.split("\n").map(l => l.trim()).filter(Boolean);
    const action: ParsedAction = { action: "", connector: "", prompt: "", params: {} };

    // 第一行是 action 的值
    action.action = lines[0]?.trim() ?? "";

    for (const line of lines.slice(1)) {
      const kv = line.match(/^(\w+):\s*(.+)$/);
      if (kv) {
        const key = kv[1]!;
        const value = kv[2]!.trim().replace(/^["']|["']$/g, "");
        if (key === "connector") action.connector = value;
        else if (key === "prompt") action.prompt = value;
        else action.params[key] = value;
      }
    }

    if (action.connector) {
      actions.push(action);
    }
  }

  return actions;
}
