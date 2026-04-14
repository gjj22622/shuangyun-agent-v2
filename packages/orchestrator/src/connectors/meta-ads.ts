/**
 * Meta Ads Connector — 建立廣告草稿（PAUSED，不自動投放）。
 * 需要：META_ACCESS_TOKEN + META_AD_ACCOUNT_ID
 */

import type { ConnectorInput, ConnectorResult } from "@shuangyun/shared-types";
import type { Connector } from "./base.js";

export class MetaAdsConnector implements Connector {
  readonly id = "meta-ads";
  readonly category = "ads" as const;
  readonly name = "Meta 廣告草稿";
  readonly requiredEnvKeys = ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"];

  isAvailable(): boolean {
    return Boolean(process.env.META_ACCESS_TOKEN?.trim() && process.env.META_AD_ACCOUNT_ID?.trim());
  }

  estimateCost(_input: ConnectorInput): number { return 0; } // 草稿不花錢

  async execute(input: ConnectorInput): Promise<ConnectorResult> {
    const accessToken = process.env.META_ACCESS_TOKEN?.trim();
    const adAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
    if (!accessToken || !adAccountId) {
      return { success: false, connectorId: this.id, outputType: "ad_draft", content: "缺少 META_ACCESS_TOKEN 或 META_AD_ACCOUNT_ID", metadata: {}, costUsd: 0, durationMs: 0 };
    }

    const campaignName = String(input.params.campaign_name ?? input.prompt.slice(0, 50));
    const objective = String(input.params.objective ?? "OUTCOME_ENGAGEMENT");
    const startTime = Date.now();

    try {
      // 建�� Campaign（PAUSED）
      const campRes = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          objective,
          status: "PAUSED",
          special_ad_categories: [],
          access_token: accessToken
        })
      });

      if (!campRes.ok) {
        const err = await campRes.text();
        return { success: false, connectorId: this.id, outputType: "ad_draft", content: `Meta Ads Campaign 建立失敗: ${err.slice(0, 200)}`, metadata: {}, costUsd: 0, durationMs: Date.now() - startTime };
      }

      const campaign = await campRes.json() as { id: string };

      return {
        success: true, connectorId: this.id, outputType: "ad_draft",
        content: `[草稿] Campaign 已建立（PAUSED），ID: ${campaign.id}。到 Meta Ads Manager 確認後啟用。`,
        metadata: { campaignId: campaign.id, objective, status: "PAUSED" },
        costUsd: 0, durationMs: Date.now() - startTime
      };
    } catch (err) {
      return { success: false, connectorId: this.id, outputType: "ad_draft", content: err instanceof Error ? err.message : "Meta Ads 建立失敗", metadata: {}, costUsd: 0, durationMs: Date.now() - startTime };
    }
  }
}
