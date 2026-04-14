/**
 * Runway Gen-3 Connector — 從圖片+文字生成影片。
 * 非同步：提交任務 → 輪詢狀態 → 取影片 URL
 * 費用：~$0.05/秒
 * 需要：RUNWAY_API_KEY
 */

import type { ConnectorInput, ConnectorResult } from "@shuangyun/shared-types";
import type { Connector } from "./base.js";

const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 180000; // 3 分鐘

export class RunwayConnector implements Connector {
  readonly id = "runway";
  readonly category = "video" as const;
  readonly name = "Runway Gen-3 產影片";
  readonly requiredEnvKeys = ["RUNWAY_API_KEY"];

  isAvailable(): boolean {
    return Boolean(process.env.RUNWAY_API_KEY?.trim());
  }

  estimateCost(input: ConnectorInput): number {
    const duration = Number(input.params.duration ?? 5);
    return duration * 0.05;
  }

  async execute(input: ConnectorInput): Promise<ConnectorResult> {
    const apiKey = process.env.RUNWAY_API_KEY?.trim();
    if (!apiKey) {
      return { success: false, connectorId: this.id, outputType: "video_url", content: "缺少 RUNWAY_API_KEY", metadata: {}, costUsd: 0, durationMs: 0 };
    }

    const duration = Number(input.params.duration ?? 5);
    const promptImage = String(input.params.promptImage ?? input.params.image_url ?? "");
    const startTime = Date.now();

    try {
      // 提交任務
      const submitRes = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "X-Runway-Version": "2024-11-06" },
        body: JSON.stringify({
          promptImage: promptImage || undefined,
          promptText: input.prompt,
          duration,
          watermark: false
        })
      });

      if (!submitRes.ok) {
        const errBody = await submitRes.text();
        return { success: false, connectorId: this.id, outputType: "video_url", content: `Runway 提交失敗 (${submitRes.status}): ${errBody.slice(0, 200)}`, metadata: {}, costUsd: 0, durationMs: Date.now() - startTime };
      }

      const task = await submitRes.json() as { id: string };
      const taskId = task.id;

      // 輪詢狀態
      let elapsed = 0;
      while (elapsed < MAX_WAIT_MS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        elapsed += POLL_INTERVAL_MS;

        const statusRes = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
          headers: { Authorization: `Bearer ${apiKey}`, "X-Runway-Version": "2024-11-06" }
        });
        const status = await statusRes.json() as { status: string; output?: string[] };

        if (status.status === "SUCCEEDED" && status.output?.[0]) {
          return {
            success: true, connectorId: this.id, outputType: "video_url",
            content: status.output[0],
            metadata: { taskId, duration, model: "gen-3" },
            costUsd: duration * 0.05,
            durationMs: Date.now() - startTime
          };
        }
        if (status.status === "FAILED") {
          return { success: false, connectorId: this.id, outputType: "video_url", content: "Runway 任務失敗", metadata: { taskId }, costUsd: 0, durationMs: Date.now() - startTime };
        }
      }

      return { success: false, connectorId: this.id, outputType: "video_url", content: "Runway 任務超時（3 分鐘）", metadata: { taskId }, costUsd: 0, durationMs: Date.now() - startTime };
    } catch (err) {
      return { success: false, connectorId: this.id, outputType: "video_url", content: err instanceof Error ? err.message : "Runway 呼叫失敗", metadata: {}, costUsd: 0, durationMs: Date.now() - startTime };
    }
  }
}
