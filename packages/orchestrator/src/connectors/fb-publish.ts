/**
 * Facebook 發佈 Connector — 透過 Facebook Pages API 發佈貼文。
 * 需要：META_ACCESS_TOKEN + FB_PAGE_ID
 */

import type { ConnectorInput, ConnectorResult } from "@shuangyun/shared-types";
import type { Connector } from "./base.js";

export class FbPublishConnector implements Connector {
  readonly id = "fb-publish";
  readonly category = "social" as const;
  readonly name = "Facebook 發佈";
  readonly requiredEnvKeys = ["META_ACCESS_TOKEN", "FB_PAGE_ID"];

  isAvailable(): boolean {
    return Boolean(process.env.META_ACCESS_TOKEN?.trim() && process.env.FB_PAGE_ID?.trim());
  }

  estimateCost(_input: ConnectorInput): number { return 0; }

  async execute(input: ConnectorInput): Promise<ConnectorResult> {
    const accessToken = process.env.META_ACCESS_TOKEN?.trim();
    const pageId = process.env.FB_PAGE_ID?.trim();
    if (!accessToken || !pageId) {
      return { success: false, connectorId: this.id, outputType: "post_url", content: "缺少 META_ACCESS_TOKEN 或 FB_PAGE_ID", metadata: {}, costUsd: 0, durationMs: 0 };
    }

    const message = input.prompt || String(input.params.message ?? "");
    const link = String(input.params.link ?? "");
    const imageUrl = String(input.params.image_url ?? "");
    const startTime = Date.now();

    try {
      const body: Record<string, string> = { message, access_token: accessToken };
      if (link) body.link = link;

      // 有圖片用 photos API，沒圖片用 feed API
      const endpoint = imageUrl
        ? `https://graph.facebook.com/v21.0/${pageId}/photos`
        : `https://graph.facebook.com/v21.0/${pageId}/feed`;

      if (imageUrl) body.url = imageUrl;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, connectorId: this.id, outputType: "post_url", content: `FB 發佈失敗: ${err.slice(0, 200)}`, metadata: {}, costUsd: 0, durationMs: Date.now() - startTime };
      }

      const data = await res.json() as { id: string; post_id?: string };
      const postId = data.post_id ?? data.id;

      return {
        success: true, connectorId: this.id, outputType: "post_url",
        content: `https://www.facebook.com/${postId}`,
        metadata: { postId, pageId },
        costUsd: 0, durationMs: Date.now() - startTime
      };
    } catch (err) {
      return { success: false, connectorId: this.id, outputType: "post_url", content: err instanceof Error ? err.message : "FB 發佈失敗", metadata: {}, costUsd: 0, durationMs: Date.now() - startTime };
    }
  }
}
