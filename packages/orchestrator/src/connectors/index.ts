/**
 * Connector 初始化 — 註冊所有可用的 Connector。
 */

import { registerConnector } from "./registry.js";
import { DallEConnector } from "./dall-e.js";
import { FluxConnector } from "./flux.js";
import { RunwayConnector } from "./runway.js";
import { IgPublishConnector } from "./ig-publish.js";
import { FbPublishConnector } from "./fb-publish.js";
import { MetaAdsConnector } from "./meta-ads.js";

export function initConnectors(): void {
  registerConnector(new DallEConnector());
  registerConnector(new FluxConnector());
  registerConnector(new RunwayConnector());
  registerConnector(new IgPublishConnector());
  registerConnector(new FbPublishConnector());
  registerConnector(new MetaAdsConnector());
}

export { parseActions } from "./base.js";
export { executeActions, listConnectors, listAvailableConnectors, getConnector } from "./registry.js";
