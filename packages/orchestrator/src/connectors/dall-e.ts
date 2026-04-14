/**
 * DALL-E 3 Connector — 呼叫 OpenAI Images API 產生圖片。
 *
 * 費用：standard 1024x1024 = $0.04, hd = $0.08
 * 需要：OPENAI_API_KEY
 */

import type { ConnectorInput, ConnectorResult } from "@shuangyun/shared-types";
import type { Connector } from "./base.js";

const COST_MAP: Record<string, number> = {
  "standard_1024x1024": 0.04,
  "standard_1024x1792": 0.08,
  "standard_1792x1024": 0.08,
  "hd_1024x1024": 0.08,
  "hd_1024x1792": 0.12,
  "hd_1792x1024": 0.12
};

export class DallEConnector implements Connector {
  readonly id = "dall-e";
  readonly category = "image" as const;
  readonly name = "DALL-E 3 產圖";
  readonly requiredEnvKeys = ["OPENAI_API_KEY"];

  isAvailable(): boolean {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  estimateCost(input: ConnectorInput): number {
    const quality = String(input.params.quality ?? "standard");
    const size = String(input.params.size ?? "1024x1024");
    return COST_MAP[`${quality}_${size}`] ?? 0.04;
  }

  async execute(input: ConnectorInput): Promise<ConnectorResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return { success: false, connectorId: this.id, outputType: "image_url", content: "缺少 OPENAI_API_KEY", metadata: {}, costUsd: 0, durationMs: 0 };
    }

    const size = String(input.params.size ?? "1024x1024");
    const quality = String(input.params.quality ?? "standard");
    const startTime = Date.now();

    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: input.prompt,
          n: 1,
          size,
          quality
        })
      });

      if (!res.ok) {
        const errBody = await res.text();
        return {
          success: false,
          connectorId: this.id,
          outputType: "image_url",
          content: `DALL-E API 錯誤 (${res.status}): ${errBody.slice(0, 200)}`,
          metadata: { status: res.status },
          costUsd: 0,
          durationMs: Date.now() - startTime
        };
      }

      const data = await res.json() as { data: Array<{ url: string; revised_prompt?: string }> };
      const imageUrl = data.data[0]?.url ?? "";
      const revisedPrompt = data.data[0]?.revised_prompt ?? "";
      const costUsd = this.estimateCost(input);

      return {
        success: true,
        connectorId: this.id,
        outputType: "image_url",
        content: imageUrl,
        metadata: { revisedPrompt, size, quality, model: "dall-e-3" },
        costUsd,
        durationMs: Date.now() - startTime
      };
    } catch (err) {
      return {
        success: false,
        connectorId: this.id,
        outputType: "image_url",
        content: err instanceof Error ? err.message : "DALL-E 呼叫失敗",
        metadata: {},
        costUsd: 0,
        durationMs: Date.now() - startTime
      };
    }
  }
}
