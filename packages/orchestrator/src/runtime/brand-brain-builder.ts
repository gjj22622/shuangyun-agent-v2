import type { BrandBrainBuildResult, BrandDataroomDoc, BrandDataroomDocType, QualityReport, SkillManifest } from "@shuangyun/shared-types";
import { brandBrainBuildResultSchema, brandDataroomDocTypeSchema, qualityReportSchema } from "@shuangyun/shared-types";
import { z } from "zod";
import { callClaudeWithJsonSchema, callClaudeWithUsageCheap, type ClaudeCallResult } from "../integrations/anthropic.js";

const requiredDocTypes = ["business_dev", "deep_search", "brand_boundary"] as const satisfies BrandDataroomDocType[];
const optionalDocTypes = ["weekly_meeting", "founder_personality"] as const satisfies BrandDataroomDocType[];

const summarySchema = z.record(z.string(), z.array(z.string()));
const strategyNotesSchema = z.object({
  strategyNotes: z.array(z.string()).min(5).max(8)
});
const agentDraftSchema = z.object({
  systemPrompt: z.string().min(1),
  responsibilities: z.array(z.string()).min(2).max(6),
  dataroomRefs: z.array(brandDataroomDocTypeSchema).min(1)
});
const agentDraftsSchema = z.object({
  boss: agentDraftSchema,
  manager: agentDraftSchema,
  window: agentDraftSchema,
  brand: agentDraftSchema
});

type SummaryShape = z.infer<typeof summarySchema>;
type BuildSummaryRecord = {
  businessDev: SummaryShape;
  weeklyMeeting: SummaryShape | null;
  deepSearch: SummaryShape;
  founderPersonality: SummaryShape | null;
  brandBoundary: SummaryShape;
};

export type BrandBrainBuildStep =
  | "summary_business_dev"
  | "summary_weekly_meeting"
  | "summary_deep_search"
  | "summary_founder_personality"
  | "summary_brand_boundary"
  | "generate_agents"
  | "generate_strategy_notes"
  | "quality_self_check";

export type BuildBrandBrainOptions = {
  claudeCall?: (input: { system: string; user: string; maxTokens?: number }) => Promise<ClaudeCallResult>;
  claudeJsonCall?: (input: { system: string; user: string; maxTokens?: number; jsonSchema: Record<string, unknown> }) => Promise<ClaudeCallResult>;
  onCallComplete?: (event: { step: BrandBrainBuildStep; result: ClaudeCallResult }) => Promise<void> | void;
};

export class NoDocumentsUploadedError extends Error {
  constructor() {
    super("尚未上傳任何品牌資料文件");
    this.name = "NoDocumentsUploadedError";
  }
}

export class RequiredDocumentMissingError extends Error {
  constructor(public readonly missingDocTypes: BrandDataroomDocType[]) {
    super(`缺少必要文件：${missingDocTypes.join(", ")}`);
    this.name = "RequiredDocumentMissingError";
  }
}

export const brandBrainBuilderSkillManifest: SkillManifest = {
  skillId: "brand-brain-builder",
  name: "品牌腦生成器",
  kind: "workflow",
  category: "brand_voice",
  version: "0.1.0",
  description: "從品牌資料文件自動萃取摘要，生成 4 個 Agent prompt、strategyNotes 與品質自檢報告。",
  inputSchema: {
    type: "object",
    required: ["docs"],
    properties: {
      docs: { type: "array" }
    }
  },
  outputSchema: {
    type: "object",
    required: ["agents", "strategyNotes", "qualityReport", "summaries", "costSummary"],
    properties: {
      agents: { type: "object" },
      strategyNotes: { type: "array" },
      qualityReport: { type: "object" },
      summaries: { type: "object" },
      costSummary: { type: "object" }
    }
  },
  blocks: [
    {
      blockId: "brand-brain-builder-input",
      name: "文件整理",
      type: "input",
      systemPrompt: "整理五類品牌資料文件，建立可供摘要的輸入內容。"
    },
    {
      blockId: "brand-brain-builder-run",
      name: "品牌腦生成",
      type: "skill",
      systemPrompt: "從文件摘要生成 4 個 Agent prompt 與 strategyNotes。"
    },
    {
      blockId: "brand-brain-builder-qa",
      name: "品質自檢",
      type: "qa",
      systemPrompt: "用測試場景檢查品牌腦草稿是否可用，回傳分數與修正建議。"
    },
    {
      blockId: "brand-brain-builder-output",
      name: "結果封裝",
      type: "output",
      systemPrompt: "輸出 BrandBrainBuildResult JSON。"
    }
  ],
  isShared: true
};

const summaryDefinitions: Record<
  BrandDataroomDocType,
  {
    step: BrandBrainBuildStep;
    outputKey: keyof BuildSummaryRecord;
    fieldNames: string[];
    heading: string;
    instruction: string;
  }
> = {
  business_dev: {
    step: "summary_business_dev",
    outputKey: "businessDev",
    fieldNames: ["ownerVision", "ownerRedLines", "promises", "expectations", "dealBreakers"],
    heading: "商務開發摘要",
    instruction: "請整理創辦人想達成的商業方向、不能退讓的底線、對客戶承諾、合作期待與踩雷點。"
  },
  weekly_meeting: {
    step: "summary_weekly_meeting",
    outputKey: "weeklyMeeting",
    fieldNames: ["kpis", "corrections", "communicationPreferences", "recurringPainPoints"],
    heading: "週會記錄摘要",
    instruction: "請整理週會裡反覆出現的 KPI、修正要求、溝通偏好與經常發生的痛點。"
  },
  deep_search: {
    step: "summary_deep_search",
    outputKey: "deepSearch",
    fieldNames: ["positioning", "targetAudience", "competitors", "differentiators", "marketGaps"],
    heading: "Deep Search 摘要",
    instruction: "請整理品牌定位、目標受眾、競品、差異化與市場空缺。"
  },
  founder_personality: {
    step: "summary_founder_personality",
    outputKey: "founderPersonality",
    fieldNames: ["toneOfVoice", "personality", "preferredPhrases", "bannedPhrases", "communicationStyle"],
    heading: "創辦人個性摘要",
    instruction: "請整理創辦人的語氣、性格、愛用說法、禁用說法與溝通風格。"
  },
  brand_boundary: {
    step: "summary_brand_boundary",
    outputKey: "brandBoundary",
    fieldNames: ["bannedTopics", "legalConstraints", "contractLimits", "complianceRules", "absoluteNos"],
    heading: "品牌邊界摘要",
    instruction: "請整理品牌不能談的主題、法務限制、合約界線、合規規則與絕對禁止事項。"
  }
};

const docTypeLabels: Record<BrandDataroomDocType, string> = {
  business_dev: "商務開發",
  weekly_meeting: "週會記錄",
  deep_search: "Deep Search",
  founder_personality: "創辦人個性",
  brand_boundary: "品牌邊界"
};

export async function buildBrandBrainFromDocs(
  docs: BrandDataroomDoc[],
  options: BuildBrandBrainOptions = {}
): Promise<BrandBrainBuildResult> {
  if (docs.length === 0) {
    throw new NoDocumentsUploadedError();
  }

  const missingDocTypes = requiredDocTypes.filter((docType) => !docs.some((doc) => doc.docType === docType));
  if (missingDocTypes.length > 0) {
    throw new RequiredDocumentMissingError([...missingDocTypes]);
  }

  const claudeCall = options.claudeCall ?? callClaudeWithUsageCheap;
  const groupedDocs = groupDocsByType(docs);
  const costSummary = {
    inputTokens: 0,
    outputTokens: 0,
    estimatedUsd: 0
  };

  const summaries: BuildSummaryRecord = {
    businessDev: await summarizeDocType("business_dev", groupedDocs.business_dev, claudeCall, options, costSummary),
    weeklyMeeting: groupedDocs.weekly_meeting.length
      ? await summarizeDocType("weekly_meeting", groupedDocs.weekly_meeting, claudeCall, options, costSummary)
      : null,
    deepSearch: await summarizeDocType("deep_search", groupedDocs.deep_search, claudeCall, options, costSummary),
    founderPersonality: groupedDocs.founder_personality.length
      ? await summarizeDocType("founder_personality", groupedDocs.founder_personality, claudeCall, options, costSummary)
      : null,
    brandBoundary: await summarizeDocType("brand_boundary", groupedDocs.brand_boundary, claudeCall, options, costSummary)
  };

  const agentDrafts = await generateAgents(summaries, claudeCall, options, costSummary);
  const strategyNotes = await generateStrategyNotes(summaries, claudeCall, options, costSummary);
  const qualityReport = await generateQualityReport(agentDrafts, strategyNotes, summaries, claudeCall, options, costSummary);

  return brandBrainBuildResultSchema.parse({
    agents: {
      boss: normalizeAgentDraft(agentDrafts.boss, groupedDocs),
      manager: normalizeAgentDraft(agentDrafts.manager, groupedDocs),
      window: normalizeAgentDraft(agentDrafts.window, groupedDocs),
      brand: normalizeAgentDraft(agentDrafts.brand, groupedDocs)
    },
    strategyNotes,
    qualityReport,
    summaries,
    costSummary: {
      inputTokens: costSummary.inputTokens,
      outputTokens: costSummary.outputTokens,
      estimatedUsd: Number(costSummary.estimatedUsd.toFixed(6))
    }
  });
}

function groupDocsByType(docs: BrandDataroomDoc[]): Record<BrandDataroomDocType, BrandDataroomDoc[]> {
  return {
    business_dev: docs.filter((doc) => doc.docType === "business_dev"),
    weekly_meeting: docs.filter((doc) => doc.docType === "weekly_meeting"),
    deep_search: docs.filter((doc) => doc.docType === "deep_search"),
    founder_personality: docs.filter((doc) => doc.docType === "founder_personality"),
    brand_boundary: docs.filter((doc) => doc.docType === "brand_boundary")
  };
}

async function summarizeDocType(
  docType: BrandDataroomDocType,
  docs: BrandDataroomDoc[],
  claudeCall: NonNullable<BuildBrandBrainOptions["claudeCall"]>,
  options: BuildBrandBrainOptions,
  costSummary: BrandBrainBuildResult["costSummary"]
): Promise<SummaryShape> {
  const definition = summaryDefinitions[docType];
  const stubSummary: SummaryShape = {};
  for (const fn of definition.fieldNames) { stubSummary[fn] = ["[STUB] 尚未連接 Claude API"]; }
  const result = await runClaudeStep(
    definition.step,
    buildSummaryPrompt(definition.heading, definition.fieldNames, definition.instruction, docs),
    summarySchema,
    claudeCall,
    options,
    costSummary,
    900,
    stubSummary
  );
  return result;
}

async function generateAgents(
  summaries: BuildSummaryRecord,
  claudeCall: NonNullable<BuildBrandBrainOptions["claudeCall"]>,
  options: BuildBrandBrainOptions,
  costSummary: BrandBrainBuildResult["costSummary"]
): Promise<z.infer<typeof agentDraftsSchema>> {
  const stubAgents = {
    boss: { systemPrompt: "[STUB] 老闆 Agent — 尚未連接 Claude API", responsibilities: ["願景紅線", "品牌方向"], dataroomRefs: ["business_dev"] },
    manager: { systemPrompt: "[STUB] 主管 Agent — 尚未連接 Claude API", responsibilities: ["策略 KPI", "執行追蹤"], dataroomRefs: ["deep_search"] },
    window: { systemPrompt: "[STUB] 窗口 Agent — 尚未連接 Claude API", responsibilities: ["日常偏好", "溝通風格"], dataroomRefs: ["weekly_meeting"] },
    brand: { systemPrompt: "[STUB] 品牌 Agent — 尚未連接 Claude API", responsibilities: ["語調守門", "合規檢查"], dataroomRefs: ["brand_boundary"] }
  };

  // Agent prompt 生成用 Tool Use（因為 systemPrompt 太長，raw JSON 常有 parse 問題）
  const jsonCall = options.claudeJsonCall ?? callClaudeWithJsonSchema;
  const prompt = buildAgentPrompt(summaries);
  const agentJsonSchema = {
    type: "object" as const,
    required: ["boss", "manager", "window", "brand"],
    properties: {
      boss: { type: "object" as const, required: ["systemPrompt", "responsibilities", "dataroomRefs"], properties: { systemPrompt: { type: "string" as const }, responsibilities: { type: "array" as const, items: { type: "string" as const } }, dataroomRefs: { type: "array" as const, items: { type: "string" as const, enum: ["business_dev", "weekly_meeting", "deep_search", "founder_personality", "brand_boundary"] } } } },
      manager: { type: "object" as const, required: ["systemPrompt", "responsibilities", "dataroomRefs"], properties: { systemPrompt: { type: "string" as const }, responsibilities: { type: "array" as const, items: { type: "string" as const } }, dataroomRefs: { type: "array" as const, items: { type: "string" as const, enum: ["business_dev", "weekly_meeting", "deep_search", "founder_personality", "brand_boundary"] } } } },
      window: { type: "object" as const, required: ["systemPrompt", "responsibilities", "dataroomRefs"], properties: { systemPrompt: { type: "string" as const }, responsibilities: { type: "array" as const, items: { type: "string" as const } }, dataroomRefs: { type: "array" as const, items: { type: "string" as const, enum: ["business_dev", "weekly_meeting", "deep_search", "founder_personality", "brand_boundary"] } } } },
      brand: { type: "object" as const, required: ["systemPrompt", "responsibilities", "dataroomRefs"], properties: { systemPrompt: { type: "string" as const }, responsibilities: { type: "array" as const, items: { type: "string" as const } }, dataroomRefs: { type: "array" as const, items: { type: "string" as const, enum: ["business_dev", "weekly_meeting", "deep_search", "founder_personality", "brand_boundary"] } } } }
    }
  };

  try {
    const result = await jsonCall({
      system: prompt.system,
      user: prompt.user,
      maxTokens: 2000,
      jsonSchema: agentJsonSchema
    });
    costSummary.inputTokens += result.inputTokens;
    costSummary.outputTokens += result.outputTokens;
    costSummary.estimatedUsd += estimateUsageUsd(result);
    await options.onCallComplete?.({ step: "generate_agents", result });

    if (result.text.startsWith("[STUB]")) {
      return agentDraftsSchema.parse(stubAgents);
    }
    const parsed = JSON.parse(result.text);
    // Claude Tool Use 偶爾會漏掉某個 agent，用 stub 補齊
    const merged = {
      boss: parsed.boss ?? stubAgents.boss,
      manager: parsed.manager ?? stubAgents.manager,
      window: parsed.window ?? stubAgents.window,
      brand: parsed.brand ?? stubAgents.brand
    };
    return agentDraftsSchema.parse(merged);
  } catch (err) {
    console.warn("[brand-brain-builder] generate_agents tool_use 失敗，使用 fallback:", err instanceof Error ? err.message : err);
    return agentDraftsSchema.parse(stubAgents);
  }
}

async function generateStrategyNotes(
  summaries: BuildSummaryRecord,
  claudeCall: NonNullable<BuildBrandBrainOptions["claudeCall"]>,
  options: BuildBrandBrainOptions,
  costSummary: BrandBrainBuildResult["costSummary"]
): Promise<string[]> {
  const result = await runClaudeStep(
    "generate_strategy_notes",
    buildStrategyNotesPrompt(summaries),
    strategyNotesSchema,
    claudeCall,
    options,
    costSummary,
    800,
    { strategyNotes: ["[STUB] 品牌策略方向 1", "[STUB] 品牌策略方向 2", "[STUB] 品牌策略方向 3", "[STUB] 禁區清單", "[STUB] 目標受眾描述"] }
  );
  return result.strategyNotes;
}

async function generateQualityReport(
  agentDrafts: z.infer<typeof agentDraftsSchema>,
  strategyNotes: string[],
  summaries: BuildSummaryRecord,
  claudeCall: NonNullable<BuildBrandBrainOptions["claudeCall"]>,
  options: BuildBrandBrainOptions,
  costSummary: BrandBrainBuildResult["costSummary"]
): Promise<QualityReport> {
  return runClaudeStep(
    "quality_self_check",
    buildQualityPrompt(agentDrafts, strategyNotes, summaries),
    qualityReportSchema,
    claudeCall,
    options,
    costSummary,
    700,
    { qualityScore: 50, issues: ["[STUB] 尚未連接 Claude API，無法真實自檢"], suggestions: ["請設定 ANTHROPIC_API_KEY 後重新生成"] }
  );
}

async function runClaudeStep<T>(
  step: BrandBrainBuildStep,
  prompt: { system: string; user: string },
  schema: z.ZodType<T>,
  claudeCall: NonNullable<BuildBrandBrainOptions["claudeCall"]>,
  options: BuildBrandBrainOptions,
  costSummary: BrandBrainBuildResult["costSummary"],
  maxTokens: number,
  stubFallback?: unknown
): Promise<T> {
  const result = await claudeCall({
    system: prompt.system,
    user: prompt.user,
    maxTokens
  });
  costSummary.inputTokens += result.inputTokens;
  costSummary.outputTokens += result.outputTokens;
  costSummary.estimatedUsd += estimateUsageUsd(result);
  await options.onCallComplete?.({ step, result });
  // 嘗試 1：直接 parse
  try {
    const extracted = extractJsonPayload(result.text, undefined);
    return schema.parse(extracted);
  } catch {
    // pass — 嘗試修復
  }

  // 嘗試 2：請 Claude 自己修 JSON（retry 一次）
  try {
    console.warn(`[brand-brain-builder] ${step} JSON parse 失敗，嘗試讓 Claude 修復...`);
    const fixResult = await claudeCall({
      system: "你是 JSON 修復工具。使用者會提供一段 broken JSON，請修復並只輸出合法的 compact JSON（同一行、不加 markdown code block）。不要改變任何語意，只修復格式。",
      user: `修復以下 JSON：\n${result.text}`,
      maxTokens: maxTokens + 200
    });
    costSummary.inputTokens += fixResult.inputTokens;
    costSummary.outputTokens += fixResult.outputTokens;
    costSummary.estimatedUsd += estimateUsageUsd(fixResult);
    const fixed = extractJsonPayload(fixResult.text, stubFallback);
    return schema.parse(fixed);
  } catch (retryError) {
    console.warn(`[brand-brain-builder] ${step} 修復也失敗，使用 fallback`);
    if (stubFallback !== undefined) {
      return schema.parse(stubFallback);
    }
    throw retryError;
  }
}

function buildSummaryPrompt(heading: string, fieldNames: string[], instruction: string, docs: BrandDataroomDoc[]): {
  system: string;
  user: string;
} {
  return {
    system: [
      "你是品牌文件分析助手。",
      "請只輸出一個 compact JSON 物件（不要縮排、不要換行、不要加 Markdown code block、不要加說明文字）。JSON 字串值內若需換行語意請用 \\\\n 跳脫序列。整個 JSON 必須在同一行內。",
      "所有欄位都必須是字串陣列，每條內容都要用繁體中文。",
      `這次要產出的摘要主題是：${heading}。`,
      `必填欄位：${fieldNames.join(", ")}。`
    ].join("\n"),
    user: [
      instruction,
      "",
      "請根據以下文件整理重點，每個欄位輸出 2-6 條：",
      renderDocsForPrompt(docs)
    ].join("\n")
  };
}

function buildAgentPrompt(summaries: BuildSummaryRecord): { system: string; user: string } {
  return {
    system: [
      "你是雙云平台的品牌腦設計師。",
      "請根據品牌摘要生成 4 個 Agent 草稿，角色為 boss / manager / window / brand。",
      "只輸出一個 JSON 物件，不要加 Markdown。",
      "每個角色都必須包含：systemPrompt（繁體中文）、responsibilities（2-6 條）、dataroomRefs（1-5 個文件類型）。",
      "systemPrompt 必須可直接作為 Claude system prompt，內容具體、可執行、避免空話。",
      "dataroomRefs 只能使用這五個值：business_dev、weekly_meeting、deep_search、founder_personality、brand_boundary。"
    ].join("\n"),
    user: [
      "以下是已整理好的品牌摘要 JSON。",
      JSON.stringify(summaries, null, 2),
      "",
      "請為四個角色產出可直接上線的 systemPrompt 與 responsibilities。"
    ].join("\n")
  };
}

function buildStrategyNotesPrompt(summaries: BuildSummaryRecord): { system: string; user: string } {
  return {
    system: [
      "你是品牌策略整理助手。",
      "請只輸出 JSON：{\"strategyNotes\": string[]}。",
      "strategyNotes 必須是 5 到 8 條，每條都要是繁體中文、可直接存進平台的策略筆記。",
      "每條要盡量具體，優先涵蓋 primaryGoal、targetAudience、keyOffer、toneOfVoice、bannedTopics、合作界線。"
    ].join("\n"),
    user: [
      "以下是品牌摘要 JSON：",
      JSON.stringify(summaries, null, 2),
      "",
      "請整合成一組可供後續任務直接引用的 strategyNotes。"
    ].join("\n")
  };
}

function buildQualityPrompt(
  agentDrafts: z.infer<typeof agentDraftsSchema>,
  strategyNotes: string[],
  summaries: BuildSummaryRecord
): { system: string; user: string } {
  return {
    system: [
      "你是品牌腦 QA 審查員。",
      "請只輸出 JSON：{\"qualityScore\": number, \"issues\": string[], \"suggestions\": string[]}。",
      "qualityScore 範圍必須是 0 到 100。",
      "issues 與 suggestions 都要用繁體中文。"
    ].join("\n"),
    user: [
      "請用以下測試場景檢查品牌腦草稿是否足以指導內容生成：",
      "測試場景：請為這個品牌寫一則 Instagram 貼文，主題是新服務上線，需包含一句開場、一句核心價值、一句 CTA。",
      "",
      "Agent 草稿：",
      JSON.stringify(agentDrafts, null, 2),
      "",
      "Strategy Notes：",
      JSON.stringify(strategyNotes, null, 2),
      "",
      "品牌摘要：",
      JSON.stringify(summaries, null, 2),
      "",
      "請指出是否有角色重疊、來源不足、語氣不一致、策略筆記不夠可執行等問題。"
    ].join("\n")
  };
}

function renderDocsForPrompt(docs: BrandDataroomDoc[]): string {
  return docs
    .map((doc, index) => `### 文件 ${index + 1}\n檔名：${doc.filename}\n內容：\n${doc.content}`)
    .join("\n\n");
}

function normalizeAgentDraft(
  draft: z.infer<typeof agentDraftSchema>,
  groupedDocs: Record<BrandDataroomDocType, BrandDataroomDoc[]>
): BrandBrainBuildResult["agents"]["boss"] {
  const dataroomRefs = draft.dataroomRefs.filter((docType) => groupedDocs[docType].length > 0);
  const sourceLabels = Array.from(new Set(dataroomRefs)).map((docType) => `【來源：${docTypeLabels[docType]}】`);
  const systemPrompt = draft.systemPrompt.includes("【來源：")
    ? draft.systemPrompt.trim()
    : `${sourceLabels.join("\n")}\n${draft.systemPrompt.trim()}`.trim();

  return {
    systemPrompt,
    responsibilities: draft.responsibilities.map((item) => item.trim()).filter(Boolean),
    dataroomRefs
  };
}

function extractJsonPayload(text: string, fallback?: unknown): unknown {
  // Stub mode 偵測：callClaudeWithUsage 在沒有 API key 時回 "[STUB] ..."
  if (text.startsWith("[STUB]") && fallback !== undefined) {
    console.warn("[extractJson] STUB 文字偵測，使用 fallback");
    return fallback;
  }

  const cleaned = text
    .replace(/^```json\s*/iu, "")
    .replace(/^```\s*/iu, "")
    .replace(/```\s*$/iu, "")
    .trim();

  // 直接在原文找 { }（不依賴 markdown 剝離是否成功）
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart === -1 || objectEnd === -1 || objectEnd < objectStart) {
    console.warn("[extractJson] 找不到 JSON 物件，text 前 100 字：", text.slice(0, 100));
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error("Claude 未回傳 JSON 物件");
  }

  const jsonSlice = text.slice(objectStart, objectEnd + 1);

  // 嘗試 1：直接 parse
  try {
    return JSON.parse(jsonSlice);
  } catch {
    // pass
  }

  // 嘗試 2：修復 JSON 字串值內的真實換行（Claude 常犯的錯）
  // 策略：在 "key": "...value..." 配對內，把真實 \n \r \t 替換成跳脫版本
  // 結構性的換行（屬性之間）不動
  try {
    let inString = false;
    let escaped = false;
    let fixed = "";
    for (let i = 0; i < jsonSlice.length; i++) {
      const ch = jsonSlice[i]!;
      if (escaped) {
        fixed += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\" && inString) {
        fixed += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        fixed += ch;
        continue;
      }
      if (inString) {
        if (ch === "\n") { fixed += "\\n"; continue; }
        if (ch === "\r") { fixed += "\\r"; continue; }
        if (ch === "\t") { fixed += "\\t"; continue; }
      }
      fixed += ch;
    }
    return JSON.parse(fixed);
  } catch (parseErr) {
    console.warn("[extractJson] 所有修復嘗試失敗：", parseErr instanceof Error ? parseErr.message : parseErr);
    console.warn("[extractJson] JSON 前 200 字：", jsonSlice.slice(0, 200));
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error("Claude 回傳的 JSON 格式不正確");
  }
}

function estimateUsageUsd(result: ClaudeCallResult): number {
  const inputRate = Number(process.env.CLAUDE_INPUT_USD_PER_MTOK ?? "3");
  const outputRate = Number(process.env.CLAUDE_OUTPUT_USD_PER_MTOK ?? "15");
  return (result.inputTokens / 1_000_000) * inputRate + (result.outputTokens / 1_000_000) * outputRate;
}

export const BRAND_BRAIN_REQUIRED_DOC_TYPES = [...requiredDocTypes];
export const BRAND_BRAIN_OPTIONAL_DOC_TYPES = [...optionalDocTypes];

/* ═══════════════════ 零 Token 組裝模式 ═══════════════════ */

import { getDefaultAgentTemplates } from "./brand-brain-templates.js";

/**
 * 零 token 品牌腦組裝 — 不呼叫 Claude API。
 * 使用預設模板 prompt（含 {{ref:xxx}} 佔位符），執行時由 reference-injection 替換。
 */
export function assembleBrandBrain(
  clientName: string,
  docs: BrandDataroomDoc[]
): BrandBrainBuildResult {
  const templates = getDefaultAgentTemplates(clientName);
  const docTypes = [...new Set(docs.map(d => d.docType))];

  const agents: BrandBrainBuildResult["agents"] = {
    boss: {
      systemPrompt: templates.boss.systemPrompt,
      responsibilities: templates.boss.responsibilities,
      dataroomRefs: templates.boss.dataroomRefs.filter(r => docTypes.includes(r as BrandDataroomDocType)) as BrandDataroomDocType[]
    },
    manager: {
      systemPrompt: templates.manager.systemPrompt,
      responsibilities: templates.manager.responsibilities,
      dataroomRefs: templates.manager.dataroomRefs.filter(r => docTypes.includes(r as BrandDataroomDocType)) as BrandDataroomDocType[]
    },
    window: {
      systemPrompt: templates.window.systemPrompt,
      responsibilities: templates.window.responsibilities,
      dataroomRefs: templates.window.dataroomRefs.filter(r => docTypes.includes(r as BrandDataroomDocType)) as BrandDataroomDocType[]
    },
    brand: {
      systemPrompt: templates.brand.systemPrompt,
      responsibilities: templates.brand.responsibilities,
      dataroomRefs: templates.brand.dataroomRefs.filter(r => docTypes.includes(r as BrandDataroomDocType)) as BrandDataroomDocType[]
    }
  };

  const strategyNotes = [
    `品牌：${clientName}`,
    `已上傳文件類型：${docTypes.join("、")}`,
    "所有 agent prompt 使用 {{ref:xxx}} 模板，執行時動態注入文件原文",
    "品牌約束與禁區請參考 brand_boundary 文件",
    "商務脈絡請參考 business_dev 文件"
  ];

  const qualityReport: QualityReport = {
    qualityScore: 80,
    issues: docTypes.length < 3 ? ["建議上傳至少 3 種文件以提升品質"] : [],
    suggestions: ["模板覆蓋 4 個角色，佔位符綁定正確", "可點擊「品質檢查」按鈕執行 AI 評估"]
  };

  return {
    agents,
    strategyNotes,
    qualityReport,
    summaries: { assembled: docTypes },
    costSummary: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 }
  };
}
