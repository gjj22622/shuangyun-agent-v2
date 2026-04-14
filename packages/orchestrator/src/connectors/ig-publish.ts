/**
 * Instagram 發佈 Connector — 透過 Instagram Graph API 發佈圖片貼文。
 * 需要：META_ACCESS_TOKEN + IG_BUSINESS_ACCOUNT_ID
 * 預設草稿模式（不自動發佈）
 */

import type { ConnectorInput, ConnectorResult } from "@shuangyun/shared-types";
import type { Connector } from "./base.js";

export class IgPublishConnector implements Connector {
  readonly id = "ig-publish";
  readonly category = "social" as const;
  readonly name = "Instagram 發佈";
  readonly requiredEnvKeys = ["META_ACCESS_TOKEN", "IG_BUSINESS_ACCOUNT_ID"];

  isAvailable(): boolean {
    return Boolean(process.env.META_ACCESS_TOKEN?.trim() && process.env.IG_BUSINESS_ACCOUNT_ID?.trim());
  }

  estimateCost(_input: ConnectorInput): number { return 0; }

  async execute(input: ConnectorInput): Promise<ConnectorResult> {
    const accessToken = process.env.META_ACCESS_TOKEN?.trim();
    const igAccountId = process.env.IG_BUSINESS_ACCOUNT_ID?.trim();
    if (!accessToken || !igAccountId) {
      return { success: false, connectorId: this.id, outputType: "post_url", content: "缺少 META_ACCESS_TOKEN 或 IG_BUSINESS_ACCOUNT_ID", metadata: {}, costUsd: 0, durationMs: 0 };
    }

    const imageUrl = String(input.params.image_url ?? "");
    const caption = input.prompt || String(input.params.caption ?? "");
    const autoPublish = input.params.auto_publish === "true";
    const startTime = Date.now();

    if (!imageUrl) {
      return { success: false, connectorId: this.id, outputType: "post_url", content: "缺少 image_url 參數", metadata: {}, costUsd: 0, durationMs: 0 };
    }

    try {
      // Step 1: 建立媒體容器
      const containerRes = await fetch(
        `https://graph.facebook.com/v21.0/${igAccountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: imageUrl, caption, access_token: accessToken })
        }
      );
      if (!containerRes.ok) {
        const err = await containerRes.text();
        return { success: false, connectorId: this.id, outputType: "post_url", content: `IG 媒體容器建立失敗: ${err.slice(0, 200)}`, metadata: {}, costUsd: 0, durationMs: Date.now() - startTime };
      }
      const container = await containerRes.json() as { id: string };

      if (!autoPublish) {
        return {
          success: true, connectorId: this.id, outputType: "post_url",
          content: `[草稿] 媒體容器已建立，ID: ${container.id}。到 IG 後台確認發佈。`,
          metadata: { containerId: container.id, mode: "draft" },
          costUsd: 0, durationMs: Date.now() - startTime
        };
      }

      // Step 2: 發佈
      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${igAccountId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: container.id, access_token: accessToken })
        }
      );
      if (!publishRes.ok) {
        const err = await publishRes.text();
        return { success: false, connectorId: this.id, outputType: "post_url", content: `IG 發佈失敗: ${err.slice(0, 200)}`, metadata: { containerId: container.id }, costUsd: 0, durationMs: Date.now() - startTime };
      }
      const published = await publishRes.json() as { id: string };

      return {
        success: true, connectorId: this.id, outputType: "post_url",
        content: `https://www.instagram.com/p/${published.id}/`,
        metadata: { postId: published.id, containerId: container.id, mode: "published" },
        costUsd: 0, durationMs: Date.now() - startTime
      };
    } catch (err) {
      return { success: false, connectorId: this.id, outputType: "post_url", content: err instanceof Error ? err.message : "IG 發佈失敗", metadata: {}, costUsd: 0, durationMs: Date.now() - startTime };
    }
  }
}
