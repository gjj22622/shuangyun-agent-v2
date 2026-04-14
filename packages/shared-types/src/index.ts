import { z } from "zod";

export const clientStatusSchema = z.enum(["active", "paused", "archived"]);
export type ClientStatus = z.infer<typeof clientStatusSchema>;

export const subscriptionTierSchema = z.enum(["basic", "pro", "enterprise"]);
export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>;

export const brainRoleSchema = z.enum(["boss", "manager", "window", "brand"]);
export type BrainRole = z.infer<typeof brainRoleSchema>;

export const actorRoleSchema = z.enum(["viewer", "operator", "admin"]);
export type ActorRole = z.infer<typeof actorRoleSchema>;

export const skillKindSchema = z.enum(["workflow", "sub_agent"]);
export type SkillKind = z.infer<typeof skillKindSchema>;

export const skillCategorySchema = z.enum([
  "content_writing",
  "image_generation",
  "video_script",
  "marketing_plan",
  "ads_strategy",
  "weekly_report",
  "compliance_check",
  "brand_voice",
  "schedule_query"
]);
export type SkillCategory = z.infer<typeof skillCategorySchema>;

export const taskTypeSchema = z.enum(["content", "image", "video", "plan", "ads", "report"]);
export type TaskType = z.infer<typeof taskTypeSchema>;

export const taskStatusSchema = z.enum(["pending", "in_progress", "done", "overdue", "cancelled"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskSourceSchema = z.enum(["brain_agent", "partner", "schedule", "client_request"]);
export type TaskSource = z.infer<typeof taskSourceSchema>;

export const outputStatusSchema = z.enum(["draft", "reviewing", "passed", "rejected"]);
export type OutputStatus = z.infer<typeof outputStatusSchema>;

export const reviewVerdictSchema = z.enum(["pass", "minor_tweak", "major_rework", "reject"]);
export type ReviewVerdict = z.infer<typeof reviewVerdictSchema>;

export const feedbackTypeSchema = z.enum(["approve", "minor_change", "reject"]);
export type FeedbackType = z.infer<typeof feedbackTypeSchema>;

export const tracePhaseSchema = z.enum([
  "onboarding",
  "brain_select",
  "master_recall",
  "brain_briefing",
  "skill_run",
  "committee_review",
  "form_write",
  "feedback_poll",
  "prompt_change",
  "auth_audit"
]);
export type TracePhase = z.infer<typeof tracePhaseSchema>;

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必須為 YYYY-MM-DD");

export const subscriptionSchema = z.object({
  tier: subscriptionTierSchema,
  agentLevel: z.number().int().min(1).max(5),
  satisfaction: z.number().min(0).max(10),
  monthlyFee: z.number().nonnegative()
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const clientSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  industry: z.string(),
  createdAt: isoDateTimeSchema,
  status: clientStatusSchema,
  googleFormUrl: z.string().url().nullable(),
  googleSheetId: z.string().nullable(),
  dataroomPath: z.string(),
  subscription: subscriptionSchema
});
export type Client = z.infer<typeof clientSchema>;

export const actorSchema = z.object({
  alias: z.string().min(1),
  role: actorRoleSchema,
  tokenHashPrefix: z.string().min(6)
});
export type Actor = z.infer<typeof actorSchema>;

export const memberStatusSchema = z.enum(["active", "paused", "archived"]);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

export const memberNoteSchema = z.object({
  text: z.string().min(1),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1)
});
export type MemberNote = z.infer<typeof memberNoteSchema>;

export const teamMemberSchema = z.object({
  memberId: z.string(),
  alias: z.string().min(1),
  displayName: z.string().min(1),
  role: actorRoleSchema,
  email: z.string().email().nullable(),
  status: memberStatusSchema,
  joinedAt: isoDateTimeSchema,
  lastSeenAt: isoDateTimeSchema.nullable(),
  notes: z.array(memberNoteSchema)
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const memberQuotaSchema = z.object({
  memberId: z.string(),
  dailyUsd: z.number().nonnegative().nullable(),
  weeklyUsd: z.number().nonnegative().nullable(),
  monthlyUsd: z.number().nonnegative().nullable(),
  taskCountDailyTarget: z.number().int().positive().nullable(),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});
export type MemberQuota = z.infer<typeof memberQuotaSchema>;

export const memberActivityEntrySchema = z.object({
  memberId: z.string(),
  alias: z.string().min(1),
  taskId: z.string(),
  skillId: z.string(),
  clientId: z.string(),
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable(),
  verdict: reviewVerdictSchema.nullable(),
  status: taskStatusSchema,
  estimatedUsd: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  contentPreview: z.string()
});
export type MemberActivityEntry = z.infer<typeof memberActivityEntrySchema>;

export const memberPeriodStatsSchema = z.object({
  usd: z.number().nonnegative(),
  taskCount: z.number().int().nonnegative()
});
export type MemberPeriodStats = z.infer<typeof memberPeriodStatsSchema>;

export const memberStatusHintSchema = z.enum(["normal", "too_busy", "too_quiet"]);
export type MemberStatusHint = z.infer<typeof memberStatusHintSchema>;

export const memberSnapshotSchema = z.object({
  memberId: z.string(),
  today: memberPeriodStatsSchema,
  thisWeek: memberPeriodStatsSchema,
  thisMonth: memberPeriodStatsSchema,
  quota: z
    .object({
      dailyUsd: z.number().nonnegative().nullable(),
      weeklyUsd: z.number().nonnegative().nullable(),
      monthlyUsd: z.number().nonnegative().nullable()
    })
    .nullable(),
  lastActiveAt: isoDateTimeSchema.nullable(),
  statusHint: memberStatusHintSchema
});
export type MemberSnapshot = z.infer<typeof memberSnapshotSchema>;

export const walletTierSchema = z.enum(["Bronze", "Silver", "Gold", "Platinum"]);
export type WalletTier = z.infer<typeof walletTierSchema>;

export const walletSchema = z.object({
  memberId: z.string(),
  balance: z.number().int(),
  lifetimeEarned: z.number().int().nonnegative(),
  lifetimeSpent: z.number().int().nonnegative(),
  tier: walletTierSchema,
  tierUpdatedAt: isoDateTimeSchema,
  lastGrantAt: isoDateTimeSchema.nullable(),
  lastDailyBonusAt: isoDateTimeSchema.nullable(),
  currentStreakDays: z.number().int().nonnegative(),
  lastStreakDate: isoDateSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});
export type Wallet = z.infer<typeof walletSchema>;

export const walletTransactionTypeSchema = z.enum([
  "spend_dispatch",
  "earn_task_passed",
  "earn_task_minor",
  "earn_first_daily",
  "earn_weekly_streak",
  "earn_skill_diversity",
  "earn_high_confidence",
  "earn_onboarding",
  "earn_grant",
  "spend_penalty",
  "penalty_reject"
]);
export type WalletTransactionType = z.infer<typeof walletTransactionTypeSchema>;

export const walletTransactionSchema = z.object({
  txId: z.string(),
  memberId: z.string(),
  amount: z.number().int(),
  type: walletTransactionTypeSchema,
  reason: z.string().min(1),
  refTaskId: z.string().nullable(),
  multiplier: z.number().positive(),
  originalAmount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1)
});
export type WalletTransaction = z.infer<typeof walletTransactionSchema>;

export const tierRuleSchema = z.object({
  tier: walletTierSchema,
  threshold: z.number().int().nonnegative(),
  dailyCap: z.number().int().nonnegative(),
  icon: z.string().min(1),
  displayName: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});
export type TierRule = z.infer<typeof tierRuleSchema>;

export const rampUpConfigSchema = z.object({
  id: z.string(),
  startDate: isoDateTimeSchema,
  endDate: isoDateTimeSchema,
  multiplier: z.number().positive(),
  reason: z.string().min(1),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1)
});
export type RampUpConfig = z.infer<typeof rampUpConfigSchema>;

export const walletSnapshotSchema = z.object({
  thisTaskDeduct: z.number().int().nonnegative(),
  balance: z.number().int(),
  tier: walletTierSchema,
  tierIcon: z.string().min(1),
  nextTierGap: z.number().int().nonnegative().nullable(),
  nextTier: walletTierSchema.nullable(),
  earnThisMonth: z.number().int().nonnegative(),
  currentStreakDays: z.number().int().nonnegative(),
  rampUp: z
    .object({
      multiplier: z.number().positive(),
      daysLeft: z.number().int().positive()
    })
    .nullable(),
  earnedFromThisTask: z.number().int().nonnegative(),
  promotionJustHappened: z
    .object({
      from: walletTierSchema,
      to: walletTierSchema
    })
    .nullable()
});
export type WalletSnapshot = z.infer<typeof walletSnapshotSchema>;

export const contextRuleSchema = z.object({
  when: z.object({
    taskType: z.array(z.string()).optional(),
    channel: z.array(z.string()).optional(),
    keyword: z.array(z.string()).optional()
  }),
  inject: z.array(z.object({
    docType: z.string(),
    maxChars: z.number().int().positive().optional()
  }))
});
export type ContextRule = z.infer<typeof contextRuleSchema>;

export const brandBrainAgentSchema = z.object({
  agentId: z.string(),
  role: brainRoleSchema,
  systemPrompt: z.string(),
  dataroomRefs: z.array(z.string()),
  responsibilities: z.array(z.string()),
  contextRules: z.array(contextRuleSchema).optional()
});
export type BrandBrainAgent = z.infer<typeof brandBrainAgentSchema>;

export const brandBrainSchema = z.object({
  brainId: z.string(),
  clientId: z.string(),
  strategyNotes: z.array(z.string()),
  agents: z.record(brainRoleSchema, brandBrainAgentSchema),
  dataroomPath: z.string(),
  version: z.number().int().positive(),
  lastUpdated: isoDateTimeSchema
});
export type BrandBrain = z.infer<typeof brandBrainSchema>;

export const skillBlockTypeSchema = z.enum(["input", "skill", "qa", "output"]);
export type SkillBlockType = z.infer<typeof skillBlockTypeSchema>;

export const skillBlockSchema = z.object({
  blockId: z.string(),
  name: z.string(),
  type: skillBlockTypeSchema,
  systemPrompt: z.string()
});
export type SkillBlock = z.infer<typeof skillBlockSchema>;

export const skillManifestSchema = z.object({
  skillId: z.string(),
  name: z.string(),
  kind: skillKindSchema,
  category: skillCategorySchema,
  version: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
  blocks: z.array(skillBlockSchema),
  isShared: z.boolean(),
  // Skill Meeting 格式擴充（optional，讓 Skill 也能參與腦會議）
  personality: z.string().optional(),
  expertise: z.array(z.string()).optional(),
  signature: z.object({ style: z.string(), catchphrase: z.string() }).optional()
});
export type SkillManifest = z.infer<typeof skillManifestSchema>;

export const masterCaseSchema = z.object({
  caseId: z.string(),
  industry: z.string(),
  channel: z.string(),
  summary: z.string(),
  brief: z.string(),
  whatWorked: z.string(),
  whatFailed: z.string().nullable(),
  takeaway: z.string(),
  tags: z.array(z.string()),
  createdAt: isoDateTimeSchema
});
export type MasterCase = z.infer<typeof masterCaseSchema>;

export const playbookSchema = z.object({
  playbookId: z.string(),
  name: z.string(),
  applicableWhen: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  steps: z.array(z.string()),
  expectedOutcomes: z.array(z.string()),
  notes: z.string().nullable()
});
export type Playbook = z.infer<typeof playbookSchema>;

export const taskBriefSchema = z.object({
  angle: z.string(),
  keyMessages: z.array(z.string()),
  toneConstraints: z.array(z.string()),
  referenceCaseIds: z.array(z.string()),
  avoidList: z.array(z.string()),
  masterPlaybookId: z.string().nullable()
});
export type TaskBrief = z.infer<typeof taskBriefSchema>;

export const mediaArtifactSchema = z.object({
  kind: z.enum(["image_prompt", "video_storyboard", "audio_script"]),
  label: z.string(),
  payload: z.string()
});
export type MediaArtifact = z.infer<typeof mediaArtifactSchema>;

export const qaSignalsSchema = z.object({
  completeness: z.number().min(0).max(1),
  onBrand: z.number().min(0).max(1),
  riskFlags: z.array(z.string())
});
export type QaSignals = z.infer<typeof qaSignalsSchema>;

export const skillExecutionResultSchema = z.object({
  skillId: z.string(),
  taskId: z.string(),
  status: z.enum(["ok", "partial", "failed"]),
  primaryArtifact: z.object({
    kind: z.enum(["text", "image_prompt", "video_script", "json", "list"]),
    title: z.string(),
    body: z.string()
  }),
  mediaArtifacts: z.array(mediaArtifactSchema),
  structuredData: z.record(z.string(), z.unknown()),
  qaSignals: qaSignalsSchema,
  costSummary: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    estimatedUsd: z.number().nonnegative()
  })
});
export type SkillExecutionResult = z.infer<typeof skillExecutionResultSchema>;

export const bundledOutputSchema = z.object({
  bundleId: z.string(),
  composedNarrative: z.string(),
  structuredData: z.record(z.string(), z.unknown()),
  mediaArtifacts: z.array(mediaArtifactSchema),
  qaSignals: qaSignalsSchema
});
export type BundledOutput = z.infer<typeof bundledOutputSchema>;

export const taskBundleSchema = z.object({
  bundleId: z.string(),
  name: z.string(),
  skills: z.array(z.string()).min(1),
  mergeStrategy: z.enum(["compose", "concat", "first-only"])
});
export type TaskBundle = z.infer<typeof taskBundleSchema>;

export const taskSchema = z.object({
  taskId: z.string(),
  clientId: z.string(),
  title: z.string(),
  type: taskTypeSchema,
  skillId: z.string(),
  status: taskStatusSchema,
  createdBy: taskSourceSchema,
  createdAt: isoDateTimeSchema,
  dueAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  assignee: z.string().nullable(),
  progress: z.number().min(0).max(100),
  resultFormRowId: z.string().nullable()
});
export type Task = z.infer<typeof taskSchema>;

export const committeeReviewSchema = z.object({
  bossScore: z.number().min(0).max(10),
  bossNote: z.string(),
  managerScore: z.number().min(0).max(10),
  managerNote: z.string(),
  windowScore: z.number().min(0).max(10),
  windowNote: z.string(),
  brandScore: z.number().min(0).max(10),
  brandNote: z.string(),
  verdict: reviewVerdictSchema,
  confidence: z.number().min(0).max(100),
  reasoningTrace: z.string()
});
export type CommitteeReview = z.infer<typeof committeeReviewSchema>;

export const outputSchema = z.object({
  outputId: z.string(),
  taskId: z.string(),
  clientId: z.string(),
  type: taskTypeSchema,
  title: z.string(),
  contentBody: z.string(),
  assetUrls: z.array(z.string().url()),
  skillUsed: z.string(),
  review: committeeReviewSchema.nullable(),
  status: outputStatusSchema,
  formRowId: z.string().nullable(),
  createdAt: isoDateTimeSchema
});
export type Output = z.infer<typeof outputSchema>;

export const feedbackSchema = z.object({
  feedbackId: z.string(),
  clientId: z.string(),
  outputId: z.string(),
  submittedBy: z.string(),
  feedbackType: feedbackTypeSchema,
  content: z.string(),
  submittedAt: isoDateTimeSchema,
  appliedToBrain: z.boolean()
});
export type Feedback = z.infer<typeof feedbackSchema>;

export const traceLogSchema = z.object({
  traceId: z.string(),
  taskId: z.string().nullable(),
  clientId: z.string().nullable(),
  phase: tracePhaseSchema,
  stepName: z.string(),
  inputSummary: z.string(),
  outputSummary: z.string(),
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable(),
  errorCode: z.string().nullable()
});
export type TraceLog = z.infer<typeof traceLogSchema>;

export const pendingPromptChangeSchema = z.object({
  changeId: z.string(),
  brainId: z.string(),
  requestedBy: z.string(),
  currentVersion: z.number().int().positive(),
  proposedPrompt: z.string(),
  rationale: z.string(),
  createdAt: isoDateTimeSchema,
  approvedAt: isoDateTimeSchema.nullable(),
  approvedBy: z.string().nullable()
});
export type PendingPromptChange = z.infer<typeof pendingPromptChangeSchema>;

export const costLedgerEntrySchema = z.object({
  date: isoDateSchema,
  actorAlias: z.string().min(1),
  action: z.string().min(1),
  estimatedUsd: z.number().nonnegative(),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema
});
export type CostLedgerEntry = z.infer<typeof costLedgerEntrySchema>;

export const runtimeSnapshotSchema = z.object({
  clients: z.number().int().nonnegative(),
  brandBrains: z.number().int().nonnegative(),
  skills: z.number().int().nonnegative(),
  tasks: z.number().int().nonnegative(),
  outputs: z.number().int().nonnegative(),
  feedbacks: z.number().int().nonnegative(),
  traces: z.number().int().nonnegative(),
  pendingPromptChanges: z.number().int().nonnegative()
});
export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>;

export const onboardingPayloadSchema = z.object({
  brandName: z.string(),
  industry: z.string(),
  primaryGoal: z.string(),
  targetAudience: z.string(),
  keyOffer: z.string(),
  toneOfVoice: z.string(),
  bannedTopics: z.string(),
  preferredChannels: z.array(z.string()).min(1),
  contentCadence: z.string(),
  campaignWindow: z.string(),
  currentPainPoint: z.string(),
  successMetric: z.string(),
  ownerName: z.string(),
  ownerEmail: z.string().email()
});
export type OnboardingPayload = z.infer<typeof onboardingPayloadSchema>;

export const taskCreatePayloadSchema = z.object({
  clientId: z.string(),
  title: z.string(),
  type: taskTypeSchema,
  skillId: z.string(),
  createdBy: taskSourceSchema.default("partner"),
  assignee: z.string().nullable().optional(),
  dueAt: isoDateTimeSchema.nullable().optional()
});
export type TaskCreatePayload = z.infer<typeof taskCreatePayloadSchema>;

// ===== Brand Dataroom & Brain Builder（brand-brain-document-builder change） =====

export const brandDataroomDocTypeSchema = z.enum([
  "business_dev",
  "weekly_meeting",
  "deep_search",
  "founder_personality",
  "brand_boundary"
]);
export type BrandDataroomDocType = z.infer<typeof brandDataroomDocTypeSchema>;

export const brandDataroomDocSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  docType: brandDataroomDocTypeSchema,
  filename: z.string(),
  content: z.string(),
  contentLength: z.number().int().nonnegative(),
  truncated: z.boolean(),
  uploadedAt: isoDateTimeSchema,
  uploadedBy: z.string()
});
export type BrandDataroomDoc = z.infer<typeof brandDataroomDocSchema>;

export const qualityReportSchema = z.object({
  qualityScore: z.number().min(0).max(100),
  issues: z.array(z.string()),
  suggestions: z.array(z.string())
});
export type QualityReport = z.infer<typeof qualityReportSchema>;

export const brandBrainAgentDraftSchema = z.object({
  systemPrompt: z.string(),
  responsibilities: z.array(z.string()),
  dataroomRefs: z.array(z.string())
});
export type BrandBrainAgentDraft = z.infer<typeof brandBrainAgentDraftSchema>;

export const brandBrainBuildResultSchema = z.object({
  agents: z.object({
    boss: brandBrainAgentDraftSchema,
    manager: brandBrainAgentDraftSchema,
    window: brandBrainAgentDraftSchema,
    brand: brandBrainAgentDraftSchema
  }),
  strategyNotes: z.array(z.string()),
  qualityReport: qualityReportSchema,
  summaries: z.record(z.string(), z.unknown()),
  costSummary: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    estimatedUsd: z.number().nonnegative()
  })
});
export type BrandBrainBuildResult = z.infer<typeof brandBrainBuildResultSchema>;

export const platformEnvSchema = z.object({
  PLATFORM_ACCESS_TOKENS: z.string().min(1),
  DAILY_COST_BUDGET_USD: z.coerce.number().positive(),
  CLAUDE_INPUT_USD_PER_MTOK: z.coerce.number().nonnegative(),
  CLAUDE_OUTPUT_USD_PER_MTOK: z.coerce.number().nonnegative(),
  APP_ENV: z.enum(["development", "staging", "production", "maintenance"])
});
export type PlatformEnv = z.infer<typeof platformEnvSchema>;

/* ───────── Brain Meeting ───────── */

export const brainMeetingModeSchema = z.enum(["consultation", "full_dispatch"]);
export type BrainMeetingMode = z.infer<typeof brainMeetingModeSchema>;

export const brainMeetingStatusSchema = z.enum(["running", "done", "error"]);
export type BrainMeetingStatus = z.infer<typeof brainMeetingStatusSchema>;

export const brainMeetingSchema = z.object({
  meetingId: z.string().min(1),
  taskId: z.string().optional(),
  clientId: z.string().min(1),
  mode: brainMeetingModeSchema,
  status: brainMeetingStatusSchema,
  startedAt: z.string(),
  endedAt: z.string().optional()
});
export type BrainMeeting = z.infer<typeof brainMeetingSchema>;

export const brainMeetingPhaseSchema = z.enum(["opening", "cross_exam", "synthesis"]);
export type BrainMeetingPhase = z.infer<typeof brainMeetingPhaseSchema>;

export const brainMeetingRoleSchema = z.enum(["strategy", "master", "brand"]);
export type BrainMeetingRole = z.infer<typeof brainMeetingRoleSchema>;

export const brainMeetingMessageSchema = z.object({
  id: z.string().min(1),
  meetingId: z.string().min(1),
  role: brainMeetingRoleSchema,
  round: z.number().int().nonnegative(),
  phase: brainMeetingPhaseSchema,
  content: z.string(),
  errorCode: z.string().optional(),
  createdAt: z.string()
});
export type BrainMeetingMessage = z.infer<typeof brainMeetingMessageSchema>;

export const brainConsultationReportSchema = z.object({
  consensus: z.array(z.string()),
  divergence: z.array(z.string()),
  openQuestions: z.array(z.string()),
  actionItems: z.array(z.string())
});
export type BrainConsultationReport = z.infer<typeof brainConsultationReportSchema>;

/* ───────── Marketplace Skill ───────── */

export const marketplaceSkillStatusSchema = z.enum(["published", "unlisted", "removed"]);
export type MarketplaceSkillStatus = z.infer<typeof marketplaceSkillStatusSchema>;

export const marketplaceSkillSchema = z.object({
  skillId: z.string().min(1),
  publisherAlias: z.string().min(1),
  publisherMemberId: z.string().optional(),
  category: z.string(),
  name: z.string().min(1),
  description: z.string(),
  promptPreview: z.string().optional(),
  installCount: z.number().int().nonnegative().default(0),
  status: marketplaceSkillStatusSchema.default("published"),
  version: z.string().default("1.0.0"),
  publishedAt: z.string()
});
export type MarketplaceSkill = z.infer<typeof marketplaceSkillSchema>;

/* ───────── Workflow ───────── */

export const workflowNodeTypeSchema = z.enum(["brain", "skill"]);
export type WorkflowNodeType = z.infer<typeof workflowNodeTypeSchema>;

export const workflowNodeSchema = z.object({
  nodeId: z.string().min(1),
  type: workflowNodeTypeSchema,
  skillId: z.string().optional(),
  brainConfig: z.object({
    brainType: z.enum(["strategy", "master", "brand"]).default("strategy"),
    clientId: z.string().optional(),
    prompt: z.string().optional()
  }).optional(),
  label: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), z.unknown()).default({})
});
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowEdgeSchema = z.object({
  edgeId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional()
});
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const workflowStatusSchema = z.enum(["draft", "active", "archived"]);

export const workflowDefinitionSchema = z.object({
  workflowId: z.string().min(1),
  name: z.string().min(1),
  clientId: z.string(),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
  createdBy: z.string(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

export const workflowExecutionStatusSchema = z.enum(["running", "done", "error", "timeout"]);

export const workflowExecutionSchema = z.object({
  executionId: z.string().min(1),
  workflowId: z.string().min(1),
  status: workflowExecutionStatusSchema,
  startedAt: z.string(),
  endedAt: z.string().optional(),
  totalCostUsd: z.number().nonnegative().default(0)
});
export type WorkflowExecution = z.infer<typeof workflowExecutionSchema>;

export const workflowStepStatusSchema = z.enum(["pending", "running", "done", "error", "skipped"]);

export const workflowExecutionStepSchema = z.object({
  stepId: z.string().min(1),
  executionId: z.string().min(1),
  nodeId: z.string().min(1),
  status: workflowStepStatusSchema,
  inputJson: z.string().default("{}"),
  outputJson: z.string().default("{}"),
  costInputTokens: z.number().int().nonnegative().default(0),
  costOutputTokens: z.number().int().nonnegative().default(0),
  costEstimatedUsd: z.number().nonnegative().default(0),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  errorMessage: z.string().optional()
});
export type WorkflowExecutionStep = z.infer<typeof workflowExecutionStepSchema>;

/* ───────── Connector ───────── */

export const connectorCategorySchema = z.enum(["text", "image", "video", "social", "ads", "file"]);
export type ConnectorCategory = z.infer<typeof connectorCategorySchema>;

export const connectorInputSchema = z.object({
  prompt: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  clientId: z.string().optional()
});
export type ConnectorInput = z.infer<typeof connectorInputSchema>;

export const connectorResultSchema = z.object({
  success: z.boolean(),
  connectorId: z.string(),
  outputType: z.enum(["text", "image_url", "video_url", "post_url", "ad_draft", "file_url"]),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().int().nonnegative()
});
export type ConnectorResult = z.infer<typeof connectorResultSchema>;
