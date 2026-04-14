/**
 * Flux Connector — 透過 fal.ai API 產生圖片。
 * 費用：~$0.01-0.03/張
 * 需要：FAL_KEY
 */

import type { ConnectorInput, ConnectorResult } from "@shuangyun/shared-types";
import type { Connector } from "./base.js";

export class FluxConnector implements Connector {
  readonly id = "flux";
  readonly category = "image" as const;
  readonly name = "Flux 產圖（fal.ai）";
  readonly requiredEnvKeys = ["FAL_KEY"];

  isAvailable(): boolean {
    return Boolean(process.env.FAL_KEY?.trim());
  }

  estimateCost(_input: ConnectorInput): number {
    return 0.02;
  }

  async execute(input: ConnectorInput): Promise<ConnectorResult> {
    const apiKey = process.env.FAL_KEY?.trim();
    if (!apiKey) {
      return { success: false, connectorId: this.id, outputType: "image_url", content: "缺少 FAL_KEY", metadata: {}, costUsd: 0, durationMs: 0 };
    }

    const imageSize = String(input.params.image_size ?? input.params.size ?? "landscape_16_9");
    const startTime = Date.now();

    try {
      const res = await fetch("https://fal.run/fal-ai/flux/dev", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${apiKey}`
        },
        body: JSON.stringify({
          prompt: input.prompt,
          image_size: imageSize,
          num_images: 1
        })
      });

      if (!res.ok) {
        const errBody = await res.text();
        return { success: false, connectorId: this.id, outputType: "image_url", content: `Flux API 錯誤 (${res.status}): ${errBody.slice(0, 200)}`, metadata: {}, costUsd: 0, durationMs: Date.now() - startTime };
      }

      const data = await res.json() as { images: Array<{ url: string }> };
      const imageUrl = data.images?.[0]?.url ?? "";

      return {
        success: true,
        connectorId: this.id,
        outputType: "image_url",
        content: imageUrl,
        metadata: { imageSize, model: "flux-dev" },
        costUsd: 0.02,
        durationMs: Date.now() - startTime
      };
    } catch (err) {
      return { success: false, connectorId: this.id, outputType: "image_url", content: err instanceof Error ? err.message : "Flux 呼叫失敗", metadata: {}, costUsd: 0, durationMs: Date.now() - startTime };
    }
  }
}
