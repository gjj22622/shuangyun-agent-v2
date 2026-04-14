import { createHash, randomUUID } from "node:crypto";
import type {
  BrandBrain,
  BrandBrainAgent,
  Client,
  OnboardingPayload,
  TraceLog
} from "@shuangyun/shared-types";
import { onboardingPayloadSchema } from "@shuangyun/shared-types";
import { appendEntry, ensureDailyBudgetAvailable } from "../auth/cost-ledger.js";
import { rewardFromEvent } from "../auth/wallet.js";
import {
  GOOGLE_FORMS_MODEL_NAME,
  GOOGLE_FORMS_SYMBOLIC_COST_USD,
  type GoogleFormsAdapter
} from "../integrations/google-forms.js";
import type { RepositoryBundle } from "../repositories/bundle.js";

function nowIso(): string {
  return new Date().toISOString();
}

function stableId(prefix: string, seed: string): string {
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 10);
  return `${prefix}_${hash}`;
}

function makeAgent(role: BrandBrainAgent["role"], payload: OnboardingPayload): BrandBrainAgent {
  const rolePromptMap: Record<BrandBrainAgent["role"], string> = {
    boss: `Protect ${payload.brandName}'s strategic direction and offer clarity.`,
    manager: `Keep ${payload.brandName}'s execution realistic and aligned with ${payload.successMetric}.`,
    window: `Represent owner ${payload.ownerName} and customer-facing communication concerns.`,
    brand: `Protect brand tone "${payload.toneOfVoice}" and avoid ${payload.bannedTopics}.`
  };

  return {
    agentId: stableId("agent", `${payload.brandName}-${role}`),
    role,
    systemPrompt: rolePromptMap[role],
    dataroomRefs: ["brand-book.md", "preferences.md", "owner-notes.md"],
    responsibilities: [
      `${role} review`,
      "committee scoring",
      "prompt update input"
    ]
  };
}

function buildClient(payload: OnboardingPayload, form: { googleFormUrl: string | null; googleSheetId: string | null }): Client {
  const clientId = stableId("client", `${payload.brandName}-${payload.ownerEmail}`);
  return {
    clientId,
    name: payload.brandName,
    industry: payload.industry,
    createdAt: nowIso(),
    status: "active",
    googleFormUrl: form.googleFormUrl,
    googleSheetId: form.googleSheetId,
    dataroomPath: `/clients/${clientId}`,
    subscription: {
      tier: "basic",
      agentLevel: 3,
      satisfaction: 0,
      monthlyFee: 8000
    }
  };
}

function buildBrandBrain(client: Client, payload: OnboardingPayload): BrandBrain {
  return {
    brainId: stableId("brain", client.clientId),
    clientId: client.clientId,
    strategyNotes: [
      `Primary goal: ${payload.primaryGoal}`,
      `Target audience: ${payload.targetAudience}`,
      `Key offer: ${payload.keyOffer}`,
      `Preferred channels: ${payload.preferredChannels.join(", ")}`,
      `Success metric: ${payload.successMetric}`
    ],
    agents: {
      boss: makeAgent("boss", payload),
      manager: makeAgent("manager", payload),
      window: makeAgent("window", payload),
      brand: makeAgent("brand", payload)
    },
    dataroomPath: client.dataroomPath,
    version: 1,
    lastUpdated: nowIso()
  };
}

export async function onboardClient(
  repositories: RepositoryBundle,
  formsAdapter: GoogleFormsAdapter,
  rawPayload: OnboardingPayload,
  actorAlias = "system",
  memberId: string | null = null
): Promise<{ client: Client; brandBrain: BrandBrain; traces: TraceLog[] }> {
  const payload = onboardingPayloadSchema.parse(rawPayload);
  ensureDailyBudgetAvailable(repositories.costLedger, GOOGLE_FORMS_SYMBOLIC_COST_USD);
  const form = await formsAdapter.createBrandForm(stableId("client", `${payload.brandName}-${payload.ownerEmail}`), payload);
  appendEntry(repositories.costLedger, {
    actorAlias,
    action: "google_forms.create_brand_form",
    estimatedUsd: GOOGLE_FORMS_SYMBOLIC_COST_USD,
    model: GOOGLE_FORMS_MODEL_NAME,
    inputTokens: 0,
    outputTokens: 0,
    memberId
  });
  const client = buildClient(payload, form);
  const brandBrain = buildBrandBrain(client, payload);

  repositories.clients.create(client);
  repositories.brandBrains.save(brandBrain);
  if (memberId) {
    rewardFromEvent(repositories, memberId, "earn_onboarding", {
      reason: `onboarding:${client.clientId}`,
      createdBy: actorAlias
    });
  }

  const traces: TraceLog[] = [
    {
      traceId: randomUUID(),
      taskId: null,
      clientId: client.clientId,
      phase: "onboarding",
      stepName: "validate_payload",
      inputSummary: payload.brandName,
      outputSummary: payload.primaryGoal,
      startedAt: nowIso(),
      endedAt: nowIso(),
      errorCode: null
    },
    {
      traceId: randomUUID(),
      taskId: null,
      clientId: client.clientId,
      phase: "onboarding",
      stepName: "create_brand_brain",
      inputSummary: payload.ownerEmail,
      outputSummary: brandBrain.brainId,
      startedAt: nowIso(),
      endedAt: nowIso(),
      errorCode: null
    }
  ];

  for (const trace of traces) {
    repositories.traces.save(trace);
  }

  return { client, brandBrain, traces };
}
