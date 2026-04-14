/**
 * 腦文件解析器 — 解析 Markdown 格式的腦文件（策略腦/師傅腦/品牌腦）。
 *
 * 格式規範：
 * ---
 * brain: strategy | master | brand
 * version: 1
 * client: (品牌腦才有)
 * ---
 *
 * ## [task_type] 規則
 * - angle: 切入角度
 * - must_include: 必要訊息1, 必要訊息2
 * - tone: 語調約束
 * - banned: 禁區1, 禁區2
 * - reference_case: 參考案例摘要
 *
 * ## 通用規則
 * - ...
 */

export type BrainDocFrontmatter = {
  brain: "strategy" | "master" | "brand";
  version: number;
  client?: string;
  [key: string]: unknown;
};

export type BrainRuleSet = {
  angle: string;
  mustInclude: string[];
  tone: string[];
  banned: string[];
  referenceCases: string[];
  raw: Record<string, string>;
};

export type ParsedBrainDoc = {
  frontmatter: BrainDocFrontmatter;
  sections: Map<string, string>; // heading → body
  rawBody: string;
};

/**
 * 解析 frontmatter（簡易 key: value，不引入 yaml parser）。
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: content };
  }

  const fmBlock = fmMatch[1]!;
  const body = fmMatch[2]!;
  const frontmatter: Record<string, unknown> = {};

  for (const line of fmBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && value) {
      // 嘗試轉數字
      const num = Number(value);
      frontmatter[key] = Number.isFinite(num) && value !== "" ? num : value;
    }
  }

  return { frontmatter, body };
}

/**
 * 解析 Markdown body，按 ## heading 分段。
 */
function parseSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = body.split(/^## /m);

  for (const part of parts) {
    if (!part.trim()) continue;
    const newlineIdx = part.indexOf("\n");
    if (newlineIdx === -1) {
      sections.set(part.trim().toLowerCase(), "");
      continue;
    }
    const heading = part.slice(0, newlineIdx).trim().toLowerCase();
    const content = part.slice(newlineIdx + 1).trim();
    sections.set(heading, content);
  }

  return sections;
}

/**
 * 解析完整的腦文件。
 */
export function parseBrainDoc(markdown: string): ParsedBrainDoc {
  const { frontmatter, body } = parseFrontmatter(markdown);
  const sections = parseSections(body);

  return {
    frontmatter: {
      brain: (frontmatter.brain as string) ?? "strategy",
      version: (frontmatter.version as number) ?? 1,
      client: frontmatter.client as string | undefined,
      ...frontmatter
    } as BrainDocFrontmatter,
    sections,
    rawBody: body
  };
}

/**
 * 從段落 body 提取 key-value 規則。
 * 格式：`- key: value1, value2`
 */
function parseKeyValues(sectionBody: string): Record<string, string> {
  const kv: Record<string, string> = {};
  for (const line of sectionBody.split("\n")) {
    const match = line.match(/^-\s+(\w+)\s*:\s*(.+)$/);
    if (match) {
      kv[match[1]!] = match[2]!.trim();
    }
  }
  return kv;
}

function splitComma(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/[,、，]/).map(s => s.trim()).filter(Boolean);
}

/**
 * 從腦文件中提取指定 task_type 的規則。
 * 找不到匹配段落 → fallback 到「通用規則」→ 都沒有 → 預設值。
 */
export function extractRules(doc: ParsedBrainDoc, taskType: string): BrainRuleSet {
  // 嘗試精確匹配：「content_writing 規則」「content 規則」
  let sectionBody: string | undefined;
  for (const [heading, body] of doc.sections) {
    const normalized = heading.replace(/\s*規則\s*$/, "").trim();
    if (normalized === taskType || normalized === taskType.replace(/_/g, " ") || heading.includes(taskType)) {
      sectionBody = body;
      break;
    }
  }

  // fallback 到通用規則
  if (!sectionBody) {
    sectionBody = doc.sections.get("通用規則") ?? doc.sections.get("general") ?? "";
  }

  const kv = parseKeyValues(sectionBody);

  return {
    angle: kv.angle ?? "",
    mustInclude: splitComma(kv.must_include ?? kv.mustInclude ?? kv["must-include"]),
    tone: splitComma(kv.tone),
    banned: splitComma(kv.banned),
    referenceCases: splitComma(kv.reference_case ?? kv.referenceCase ?? kv["reference-case"]),
    raw: kv
  };
}
