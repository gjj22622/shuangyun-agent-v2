import { createHash } from "node:crypto";
import type { BrandBrain, BrandBrainAgent, Client } from "@shuangyun/shared-types";
import type { RepositoryBundle } from "../repositories/bundle.js";
import { defaultSkillCatalog } from "./catalog.js";

function nowIso(): string {
  return new Date().toISOString();
}

function stableId(prefix: string, seed: string): string {
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 10);
  return `${prefix}_${hash}`;
}

function makeAgent(role: BrandBrainAgent["role"], clientName: string): BrandBrainAgent {
  return {
    agentId: stableId("agent", `${clientName}-${role}`),
    role,
    systemPrompt: `You are the ${role} committee member for ${clientName}. Keep recommendations concise, specific, and auditable.`,
    dataroomRefs: [`${role}.md`, "brand-book.md"],
    responsibilities: [`${role} perspective`, "committee scoring", "prompt refinement input"]
  };
}

function makeSampleClient(): Client {
  return {
    clientId: "client_demo_001",
    name: "双云示範客戶",
    industry: "AI 教育服務",
    createdAt: nowIso(),
    status: "active",
    googleFormUrl: "stub://forms/client_demo_001",
    googleSheetId: "stub-sheet-client_demo_001",
    dataroomPath: "/clients/client_demo_001",
    subscription: {
      tier: "pro",
      agentLevel: 4,
      satisfaction: 8.5,
      monthlyFee: 12000
    }
  };
}

function makeSampleBrandBrain(client: Client): BrandBrain {
  return {
    brainId: stableId("brain", client.clientId),
    clientId: client.clientId,
    strategyNotes: [
      "Default MVP strategy brain is attached.",
      "Focus on speed-to-onboard and auditable review paths."
    ],
    agents: {
      boss: makeAgent("boss", client.name),
      manager: makeAgent("manager", client.name),
      window: makeAgent("window", client.name),
      brand: makeAgent("brand", client.name)
    },
    dataroomPath: client.dataroomPath,
    version: 1,
    lastUpdated: nowIso()
  };
}

export function seedFoundations(repositories: RepositoryBundle): void {
  const client = makeSampleClient();
  const brandBrain = makeSampleBrandBrain(client);

  repositories.clients.create(client);
  repositories.brandBrains.save(brandBrain);

  for (const skill of defaultSkillCatalog) {
    repositories.skills.save(skill);
  }
}
