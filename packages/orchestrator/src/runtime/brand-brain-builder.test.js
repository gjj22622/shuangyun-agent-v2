import assert from "node:assert/strict";
import {
  buildBrandBrainFromDocs,
  RequiredDocumentMissingError
} from "../../dist/runtime/brand-brain-builder.js";

await runTest("只有必要文件時會跑 6 次 Claude call", async () => {
  const steps = [];
  const result = await buildBrandBrainFromDocs(makeDocs(["business_dev", "deep_search", "brand_boundary"]), {
    claudeCall: createMockClaudeCall([
      { ownerVision: ["要變成高信任品牌"], ownerRedLines: ["不做低價競爭"], promises: ["交付可追蹤"], expectations: ["資訊透明"], dealBreakers: ["亂改承諾"] },
      { positioning: ["高信任 AI 顧問"], targetAudience: ["中小企業主"], competitors: ["一般行銷顧問"], differentiators: ["策略與執行一體"], marketGaps: ["缺少可落地 AI 導入"] },
      { bannedTopics: ["保證業績"], legalConstraints: ["不得宣稱未核實成效"], contractLimits: ["超出合約不承諾"], complianceRules: ["先審稿後發布"], absoluteNos: ["偽造案例"] },
      {
        boss: { systemPrompt: "聚焦成長方向", responsibilities: ["定義優先順序", "守住承諾"], dataroomRefs: ["business_dev", "deep_search"] },
        manager: { systemPrompt: "把事情做完", responsibilities: ["拆解任務", "對齊節奏"], dataroomRefs: ["business_dev", "brand_boundary"] },
        window: { systemPrompt: "代表客戶體感", responsibilities: ["確認語氣", "確認需求"], dataroomRefs: ["business_dev"] },
        brand: { systemPrompt: "維持品牌一致性", responsibilities: ["守住定位", "守住禁區"], dataroomRefs: ["deep_search", "brand_boundary"] }
      },
      { strategyNotes: ["主打高信任 AI 顧問", "受眾是中小企業主", "先講可落地成果再講技術", "避免低價比較", "所有對外承諾需可追蹤"] },
      { qualityScore: 88, issues: ["window 角色可再強化客戶溝通細節"], suggestions: ["補一句如何處理客戶疑慮的判準"] }
    ]),
    onCallComplete: ({ step }) => steps.push(step)
  });

  assert.deepEqual(steps, [
    "summary_business_dev",
    "summary_deep_search",
    "summary_brand_boundary",
    "generate_agents",
    "generate_strategy_notes",
    "quality_self_check"
  ]);
  assert.equal(result.summaries.weeklyMeeting, null);
  assert.equal(result.summaries.founderPersonality, null);
  assert.match(result.agents.boss.systemPrompt, /【來源：商務開發】/u);
  assert.match(result.agents.brand.systemPrompt, /【來源：品牌邊界】/u);
  assert.equal(result.strategyNotes.length, 5);
  assert.equal(result.costSummary.inputTokens, 201);
  assert.equal(result.costSummary.outputTokens, 111);
});

await runTest("五類文件齊全時會跑 8 次 Claude call", async () => {
  const steps = [];
  const result = await buildBrandBrainFromDocs(
    makeDocs(["business_dev", "weekly_meeting", "deep_search", "founder_personality", "brand_boundary"]),
    {
      claudeCall: createMockClaudeCall([
        { ownerVision: ["擴大高單價案源"], ownerRedLines: ["不接錯位客戶"], promises: ["講清楚交付"], expectations: ["決策快速"], dealBreakers: ["反覆改方向"] },
        { kpis: ["每月 3 個有效商機"], corrections: ["不要過度學術"], communicationPreferences: ["先結論後細節"], recurringPainPoints: ["訊息不一致"] },
        { positioning: ["品牌顧問型 AI 團隊"], targetAudience: ["品牌經營者"], competitors: ["外包內容團隊"], differentiators: ["策略 + 代營運"], marketGaps: ["缺少能陪跑的團隊"] },
        { toneOfVoice: ["冷靜直接"], personality: ["務實"], preferredPhrases: ["先講結論"], bannedPhrases: ["保證翻倍"], communicationStyle: ["短句清楚"] },
        { bannedTopics: ["未驗證績效"], legalConstraints: ["不得誤導"], contractLimits: ["不代替法務"], complianceRules: ["敏感內容先覆核"], absoluteNos: ["虛構證言"] },
        {
          boss: { systemPrompt: "Boss prompt", responsibilities: ["策略定錨", "取捨判斷"], dataroomRefs: ["business_dev", "deep_search"] },
          manager: { systemPrompt: "Manager prompt", responsibilities: ["交付管理", "風險提醒"], dataroomRefs: ["weekly_meeting", "brand_boundary"] },
          window: { systemPrompt: "Window prompt", responsibilities: ["對客翻譯", "溝通節奏"], dataroomRefs: ["founder_personality", "weekly_meeting"] },
          brand: { systemPrompt: "Brand prompt", responsibilities: ["語氣一致", "定位一致"], dataroomRefs: ["founder_personality", "deep_search", "brand_boundary"] }
        },
        { strategyNotes: ["定位是品牌顧問型 AI 團隊", "受眾是品牌經營者", "語氣冷靜直接", "所有績效說法必須可驗證", "先講結論再補細節", "避免過度學術"] },
        { qualityScore: 91, issues: [], suggestions: ["可再補一條危機應對筆記"] }
      ]),
      onCallComplete: ({ step }) => steps.push(step)
    }
  );

  assert.equal(steps.length, 8);
  assert.notEqual(result.summaries.weeklyMeeting, null);
  assert.notEqual(result.summaries.founderPersonality, null);
  assert.equal(result.qualityReport.qualityScore, 91);
});

await runTest("缺少必要文件時丟出 RequiredDocumentMissingError", async () => {
  await assert.rejects(
    () => buildBrandBrainFromDocs(makeDocs(["business_dev", "brand_boundary"])),
    (error) => error instanceof RequiredDocumentMissingError && error.missingDocTypes.includes("deep_search")
  );
});

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function makeDocs(docTypes) {
  return docTypes.map((docType, index) => ({
    id: `doc-${index + 1}`,
    clientId: "client_test",
    docType,
    filename: `${docType}.md`,
    content: `這是 ${docType} 的測試內容`,
    contentLength: 12,
    truncated: false,
    uploadedAt: "2026-04-09T00:00:00.000Z",
    uploadedBy: "tester"
  }));
}

function createMockClaudeCall(payloads) {
  let index = 0;

  return async () => {
    const payload = payloads[index];
    if (!payload) {
      throw new Error(`Mock payload missing at call ${index + 1}`);
    }

    index += 1;
    return {
      text: JSON.stringify(payload),
      model: "claude-sonnet-4-5",
      inputTokens: 30 + index,
      outputTokens: 15 + index
    };
  };
}
