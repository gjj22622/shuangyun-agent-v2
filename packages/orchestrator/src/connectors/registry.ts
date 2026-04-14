/**
 * Connector 註冊中心 — 管理所有 Connector 實例，根據環境變數判斷可用性。
 */

import type { ConnectorInput, ConnectorResult } from "@shuangyun/shared-types";
import type { Connector, ParsedAction } from "./base.js";

const connectors = new Map<string, Connector>();

export function registerConnector(connector: Connector): void {
  connectors.set(connector.id, connector);
}

export function getConnector(id: string): Connector | null {
  return connectors.get(id) ?? null;
}

export function listConnectors(): Connector[] {
  return [...connectors.values()];
}

export function listAvailableConnectors(): Connector[] {
  return [...connectors.values()].filter(c => c.isAvailable());
}

/**
 * 執行一組 parsed actions，依序呼叫 Connector。
 * 前一個的結果可以用 {{prev}} 傳給下一個。
 */
export async function executeActions(
  actions: ParsedAction[],
  clientId?: string
): Promise<ConnectorResult[]> {
  const results: ConnectorResult[] = [];
  let prevContent = "";

  for (const action of actions) {
    const connector = getConnector(action.connector);
    if (!connector) {
      results.push({
        success: false,
        connectorId: action.connector,
        outputType: "text",
        content: `Connector "${action.connector}" 不存在或未註冊`,
        metadata: {},
        costUsd: 0,
        durationMs: 0
      });
      continue;
    }

    if (!connector.isAvailable()) {
      results.push({
        success: false,
        connectorId: action.connector,
        outputType: "text",
        content: `Connector "${action.connector}" 不可用（缺少 API Key）`,
        metadata: {},
        costUsd: 0,
        durationMs: 0
      });
      continue;
    }

    // 替換 {{prev}} 為前一步結果
    const prompt = action.prompt.replace(/\{\{prev\}\}/g, prevContent);
    const input: ConnectorInput = {
      prompt,
      params: action.params,
      clientId
    };

    try {
      const result = await connector.execute(input);
      results.push(result);
      if (result.success) {
        prevContent = result.content;
      }
    } catch (err) {
      results.push({
        success: false,
        connectorId: action.connector,
        outputType: "text",
        content: err instanceof Error ? err.message : "Connector 執行失敗",
        metadata: {},
        costUsd: 0,
        durationMs: 0
      });
    }
  }

  return results;
}
