import Anthropic from "@anthropic-ai/sdk";

export type ClaudeCallInput = {
  system: string;
  user: string;
  maxTokens?: number;
};

export type ClaudeCallResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

const DEFAULT_MODEL = "claude-sonnet-4-5";
const CHEAP_MODEL = "claude-haiku-4-5-20251001";

let stubWarningPrinted = false;
let stubCallCount = 0;

function warnStubMode(): void {
  stubCallCount++;
  if (!stubWarningPrinted) {
    console.warn("⚠️ [CRITICAL] ANTHROPIC_API_KEY 未設定，Claude API 以 stub 模式執行。所有 AI 功能將回傳假資料！");
    stubWarningPrinted = true;
  }
  if (stubCallCount % 10 === 0) {
    console.warn(`⚠️ [STUB] 已累計 ${stubCallCount} 次 stub 呼叫，請盡快設定 ANTHROPIC_API_KEY`);
  }
}

export async function callClaude(input: ClaudeCallInput): Promise<string> {
  const result = await callClaudeWithUsage(input);
  return result.text;
}

/**
 * 用 Anthropic Tool Use 強制 Claude 回傳結構化 JSON。
 * 適合需要精確 JSON 輸出的場景（如 brand brain builder 的 agent prompt 生成）。
 * 回傳的 text 是 tool_use block 的 input JSON（保證合法）。
 */
export async function callClaudeWithJsonSchema(
  input: ClaudeCallInput & { jsonSchema: Record<string, unknown>; toolName?: string }
): Promise<ClaudeCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL_CHEAP?.trim() || CHEAP_MODEL;
  if (!apiKey) {
    warnStubMode();
    return {
      text: "[STUB]",
      model,
      inputTokens: 0,
      outputTokens: 0
    };
  }

  const toolName = input.toolName ?? "output_json";
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    system: input.system,
    max_tokens: input.maxTokens ?? 2000,
    messages: [{ role: "user", content: input.user }],
    tools: [
      {
        name: toolName,
        description: "輸出結構化 JSON 結果",
        input_schema: input.jsonSchema as Anthropic.Tool.InputSchema
      }
    ],
    tool_choice: { type: "tool", name: toolName }
  });

  const toolBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolBlock) {
    return {
      text: "[STUB] Claude 未使用 tool",
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens
    };
  }

  return {
    text: JSON.stringify(toolBlock.input),
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens
  };
}

/**
 * 用便宜模型（Haiku）呼叫 Claude。適合摘要、JSON 生成、品質自檢等不需要最高品質的工作。
 * 成本約 Sonnet 的 1/10。
 */
export async function callClaudeWithUsageCheap(input: ClaudeCallInput): Promise<ClaudeCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL_CHEAP?.trim() || CHEAP_MODEL;
  if (!apiKey) {
    warnStubMode();
    return { text: `[STUB] ${input.user.slice(0, 80)}...`, model, inputTokens: 0, outputTokens: 0 };
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    system: input.system,
    max_tokens: input.maxTokens ?? 1200,
    messages: [{ role: "user", content: input.user }]
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return { text: text || "[STUB] Claude 回傳空內容。", model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
}

export async function callClaudeWithUsage(input: ClaudeCallInput): Promise<ClaudeCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  if (!apiKey) {
    warnStubMode();
    return {
      text: `[STUB] ${input.user.slice(0, 80)}...`,
      model,
      inputTokens: 0,
      outputTokens: 0
    };
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    system: input.system,
    max_tokens: input.maxTokens ?? 1200,
    messages: [{ role: "user", content: input.user }]
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return {
    text: text || "[STUB] Claude 回傳空內容。",
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens
  };
}
