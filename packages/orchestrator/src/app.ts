import { createHash, randomUUID } from "node:crypto";
import {
  feedbackSchema,
  onboardingPayloadSchema,
  taskCreatePayloadSchema,
  type Feedback,
  type OnboardingPayload,
  type Task,
  type TaskCreatePayload
} from "@shuangyun/shared-types";
import type { GoogleFormsAdapter } from "./integrations/google-forms.js";
import type { RepositoryBundle } from "./repositories/bundle.js";
import { memberIdFromAlias } from "./auth/team-members-bootstrap.js";
import { dispatchTask } from "./runtime/dispatch.js";
import { importMarkdownDocument } from "./runtime/markdown-import.js";
import { onboardClient } from "./runtime/onboarding.js";

function nowIso(): string {
  return new Date().toISOString();
}

export type CostActorOptions = {
  actorAlias?: string;
  memberId?: string | null;
};

function resolveActorContext(repositories: RepositoryBundle, options: CostActorOptions): { actorAlias: string; memberId: string | null } {
  const actorAlias = options.actorAlias ?? "system";
  if (options.memberId !== undefined) {
    return { actorAlias, memberId: options.memberId };
  }
  if (actorAlias === "system") {
    return { actorAlias, memberId: null };
  }
  const existing = repositories.teamMembers.getByAlias(actorAlias);
  return {
    actorAlias,
    memberId: existing?.memberId ?? memberIdFromAlias(actorAlias)
  };
}

export function makeSampleOnboardingPayload(): OnboardingPayload {
  return {
    brandName: "双云示範品牌",
    industry: "AI 教育服務",
    primaryGoal: "建立可重複使用的 AI 行銷部輸出流程",
    targetAudience: "需要導入 AI 工作流的中小企業主與行銷主管",
    keyOffer: "AI 轉型教育訓練與行銷部門導入方案",
    toneOfVoice: "專業、務實、清楚、有教練感",
    bannedTopics: "誇大保證、未驗證療效、敏感政治煽動",
    preferredChannels: ["Facebook", "Instagram", "EDM"],
    contentCadence: "每週 3 篇社群貼文與 1 封 EDM",
    campaignWindow: "2026-04-15 to 2026-05-15",
    currentPainPoint: "內容產出依賴創辦人手工整合，速度慢且無法追蹤 feedback",
    successMetric: "每週可穩定交付內容並追蹤客戶回饋",
    ownerName: "Jacky",
    ownerEmail: "gjj22622@gmail.com"
  };
}

export async function runSampleOnboarding(
  repositories: RepositoryBundle,
  formsAdapter: GoogleFormsAdapter,
  options: CostActorOptions = {}
) {
  const actor = resolveActorContext(repositories, options);
  return onboardClient(repositories, formsAdapter, makeSampleOnboardingPayload(), actor.actorAlias, actor.memberId);
}

export async function createOnboarding(
  repositories: RepositoryBundle,
  formsAdapter: GoogleFormsAdapter,
  payload: unknown,
  options: CostActorOptions = {}
) {
  const actor = resolveActorContext(repositories, options);
  return onboardClient(repositories, formsAdapter, onboardingPayloadSchema.parse(payload), actor.actorAlias, actor.memberId);
}

export function makeDemoTaskPayload(): TaskCreatePayload {
  return makeDemoTaskPayloadForClient("client_demo_001");
}

export function makeDemoTaskPayloadForClient(clientId: string): TaskCreatePayload {
  return {
    clientId,
    title: "四月課程招生貼文",
    type: "content",
    skillId: "content-writing",
    createdBy: "partner",
    assignee: "content-writing",
    dueAt: null
  };
}

function buildFeedbackId(rowIndex: number, submittedAt: string, clientId: string): string {
  return createHash("sha1").update(`${rowIndex}:${submittedAt}:${clientId}`).digest("hex");
}

export async function createTaskAndDispatch(
  repositories: RepositoryBundle,
  formsAdapter: GoogleFormsAdapter,
  payload: unknown,
  options: CostActorOptions = {}
) {
  const actor = resolveActorContext(repositories, options);
  const taskPayload = taskCreatePayloadSchema.parse(payload);
  const client = repositories.clients.getById(taskPayload.clientId);
  const brandBrain = repositories.brandBrains.getByClientId(taskPayload.clientId);
  const skill = repositories.skills.findById(taskPayload.skillId);

  if (!client) {
    throw new Error(`Client ${taskPayload.clientId} not found.`);
  }
  if (!brandBrain) {
    throw new Error(`Brand brain missing for client ${taskPayload.clientId}.`);
  }
  if (!skill) {
    throw new Error(`Skill ${taskPayload.skillId} not found.`);
  }

  const task: Task = {
    taskId: randomUUID(),
    clientId: client.clientId,
    title: taskPayload.title,
    type: taskPayload.type,
    skillId: skill.skillId,
    status: "in_progress",
    createdBy: taskPayload.createdBy,
    createdAt: nowIso(),
    dueAt: taskPayload.dueAt ?? null,
    completedAt: null,
    assignee: taskPayload.assignee ?? skill.skillId,
    progress: 25,
    resultFormRowId: null
  };

  repositories.tasks.create(task);
  const result = await dispatchTask(task, client, brandBrain, skill, formsAdapter, repositories, actor.actorAlias, actor.memberId);
  repositories.outputs.save(result.output);
  for (const trace of result.traces) {
    repositories.traces.save(trace);
  }
  repositories.tasks.completeTask(task.taskId, nowIso(), result.output.formRowId);

  return {
    taskId: task.taskId,
    outputId: result.output.outputId,
    output: result.output,
    traces: result.traces,
    taskBrief: result.taskBrief,
    committeeReview: result.committeeReview,
    costSummary: result.costSummary,
    walletSnapshot: result.walletSnapshot,
    verdict: result.output.review?.verdict ?? null,
    confidence: result.output.review?.confidence ?? null
  };
}

function resolveDemoClientId(repositories: RepositoryBundle, preferredClientId: string): string {
  const preferred = repositories.clients.getById(preferredClientId);
  if (preferred?.googleSheetId) {
    return preferredClientId;
  }

  const fallback = repositories.clients.list().find((client) => Boolean(client.googleSheetId));
  return fallback?.clientId ?? preferredClientId;
}

export async function runDemoTask(
  repositories: RepositoryBundle,
  formsAdapter: GoogleFormsAdapter,
  clientId = "client_demo_001",
  options: CostActorOptions = {}
) {
  const resolvedClientId = resolveDemoClientId(repositories, clientId);
  return createTaskAndDispatch(repositories, formsAdapter, makeDemoTaskPayloadForClient(resolvedClientId), options);
}

export async function verifyFormIntegration(
  repositories: RepositoryBundle,
  formsAdapter: GoogleFormsAdapter,
  clientId: string
) {
  const client = repositories.clients.getById(clientId);
  if (!client) {
    throw new Error(`Client ${clientId} not found.`);
  }
  if (!client.googleSheetId) {
    throw new Error(`Client ${clientId} does not have googleSheetId. Run onboarding first.`);
  }

  const dispatch = await createTaskAndDispatch(repositories, formsAdapter, makeDemoTaskPayloadForClient(clientId));
  const feedbacks = await formsAdapter.listFeedback(client.googleSheetId);

  return {
    clientId,
    sheetId: client.googleSheetId,
    dispatch,
    totalFeedbacks: feedbacks.length,
    report: `create=ok / write_output=${dispatch.output.formRowId ? "ok" : "missing"} / list_feedback=ok / total_feedbacks=${feedbacks.length}`
  };
}

export async function pollFeedback(
  repositories: RepositoryBundle,
  formsAdapter: GoogleFormsAdapter,
  clientId: string,
  sinceIso?: string
) {
  const client = repositories.clients.getById(clientId);
  if (!client) {
    throw new Error(`Client ${clientId} not found.`);
  }
  if (!client.googleSheetId) {
    throw new Error(`Client ${clientId} does not have googleSheetId. Run onboarding first.`);
  }

  const records = await formsAdapter.listFeedback(client.googleSheetId, sinceIso);
  let imported = 0;
  let created = 0;
  let skipped = 0;

  for (const record of records) {
    if (!record.outputId) {
      skipped += 1;
      continue;
    }

    const feedback = feedbackSchema.parse({
      feedbackId: buildFeedbackId(record.rowIndex, record.submittedAt, record.clientId),
      clientId: record.clientId,
      outputId: record.outputId,
      submittedBy: record.submittedBy,
      feedbackType: record.feedbackType,
      content: record.content,
      submittedAt: record.submittedAt,
      appliedToBrain: false
    }) satisfies Feedback;

    imported += 1;
    const inserted = repositories.feedbacks.upsert(feedback);
    if (inserted) {
      created += 1;
    } else {
      skipped += 1;
    }
  }

  return {
    clientId,
    sheetId: client.googleSheetId,
    import: imported,
    new: created,
    skipped
  };
}

export function importMarkdown(
  repositories: RepositoryBundle,
  clientId: string,
  payload: { filename: string; markdown: string }
) {
  return importMarkdownDocument(repositories, clientId, payload);
}
