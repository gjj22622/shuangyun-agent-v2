import { basename } from "node:path";
import type { SkillCategory, SkillKind, SkillManifest } from "@shuangyun/shared-types";

type SkillDocFrontmatterValue = string | number | boolean;

export type SkillDocFrontmatter = {
  name?: string;
  "new-name"?: string;
  "legacy-name"?: string;
  layer?: string;
  domain?: string;
  version?: string;
  status?: string;
  description?: string;
  [key: string]: SkillDocFrontmatterValue | undefined;
};

export type ParsedSkillDoc = {
  frontmatter: SkillDocFrontmatter;
  body: string;
  systemPrompt: string;
};

export type ParsedSkillReference = {
  filename: string;
  content: string;
};

type BuildSkillManifestOptions = {
  filename?: string;
  skillId?: string;
  isShared?: boolean;
};

type MutableFrontmatter = Record<string, SkillDocFrontmatterValue | undefined>;

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").trim();
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^["']/, "").replace(/["']$/, "").trim();
}

function coerceFrontmatterValue(value: string): SkillDocFrontmatterValue {
  const trimmed = stripWrappingQuotes(value);
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }

  const numeric = Number(trimmed);
  if (trimmed.length > 0 && Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return numeric;
  }

  return trimmed;
}

function parseFrontmatter(markdown: string): { frontmatter: SkillDocFrontmatter; body: string } {
  const normalized = normalizeMarkdown(markdown);
  if (!normalized.startsWith("---\n")) {
    return {
      frontmatter: {},
      body: normalized
    };
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return {
      frontmatter: {},
      body: normalized
    };
  }

  const frontmatterBlock = normalized.slice(4, closingIndex);
  const body = normalized.slice(closingIndex + 5).trim();
  const frontmatter: MutableFrontmatter = {};
  const lines = frontmatterBlock.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]?.trimEnd() ?? "";
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }

    const separatorIndex = rawLine.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = rawLine.slice(0, separatorIndex).trim().toLowerCase();
    const rawValue = rawLine.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    if (rawValue === "|" || rawValue === ">") {
      const blockLines: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const candidate = lines[cursor] ?? "";
        if (!candidate.startsWith("  ") && !candidate.startsWith("\t")) {
          break;
        }
        blockLines.push(candidate.replace(/^\s{2}/, "").replace(/^\t/, ""));
        cursor += 1;
      }
      frontmatter[key] = blockLines.join("\n").trim();
      index = cursor - 1;
      continue;
    }

    frontmatter[key] = coerceFrontmatterValue(rawValue);
  }

  return {
    frontmatter: frontmatter as SkillDocFrontmatter,
    body
  };
}

function inferCategory(parsed: ParsedSkillDoc): SkillCategory {
  const domain = String(parsed.frontmatter.domain ?? "").toLowerCase();
  const name = String(parsed.frontmatter.name ?? "").toLowerCase();
  const description = String(parsed.frontmatter.description ?? "").toLowerCase();
  const prompt = parsed.systemPrompt.toLowerCase();
  const haystack = [domain, name, description, prompt].join("\n");

  if (/(ads|廣告|投放|meta|google ads)/.test(haystack)) {
    return "ads_strategy";
  }
  if (/(report|報告|週報)/.test(haystack)) {
    return "weekly_report";
  }
  if (/(image|圖片|視覺|海報)/.test(haystack)) {
    return "image_generation";
  }
  if (/(video|影片|腳本|短影音|reels)/.test(haystack)) {
    return "video_script";
  }
  if (/(schedule|行程|排程|預約)/.test(haystack)) {
    return "schedule_query";
  }
  if (/(brand|品牌|voice|語氣)/.test(haystack)) {
    return "brand_voice";
  }
  if (/(content|文案|貼文|edm|部落格)/.test(haystack)) {
    return "content_writing";
  }
  if (/(plan|策略|sostac|tbsa|營運|行銷)/.test(haystack)) {
    return "marketing_plan";
  }

  return parsed.frontmatter.layer?.toLowerCase() === "brain" ? "brand_voice" : "marketing_plan";
}

function inferKind(layer: string | undefined): SkillKind {
  const normalized = String(layer ?? "").trim().toLowerCase();
  return normalized === "brain" ? "sub_agent" : "workflow";
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveSkillId(parsed: ParsedSkillDoc, filename?: string): string {
  const candidates = [
    parsed.frontmatter["new-name"],
    parsed.frontmatter.name,
    parsed.frontmatter["legacy-name"],
    filename ? basename(filename, ".md") : undefined
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      continue;
    }
    const slug = slugify(candidate);
    if (slug) {
      return slug;
    }
  }

  return "unnamed-skill";
}

export function parseSkillDoc(markdown: string): ParsedSkillDoc {
  const { frontmatter, body } = parseFrontmatter(markdown);
  return {
    frontmatter,
    body,
    systemPrompt: body
  };
}

export function parseSkillReferences(refFiles: Array<{ filename: string; content: string }>): ParsedSkillReference[] {
  return refFiles
    .filter((file) => file.filename.toLowerCase().endsWith(".md"))
    .map((file) => ({
      filename: basename(file.filename),
      content: normalizeMarkdown(file.content)
    }));
}

export function buildSkillManifestFromSkillDoc(
  parsed: ParsedSkillDoc,
  options: BuildSkillManifestOptions = {}
): SkillManifest {
  const skillId = options.skillId ?? deriveSkillId(parsed, options.filename);
  const kind = inferKind(parsed.frontmatter.layer);
  const version = String(parsed.frontmatter.version ?? "1.0");
  const description =
    typeof parsed.frontmatter.description === "string" && parsed.frontmatter.description.trim().length > 0
      ? parsed.frontmatter.description.trim()
      : parsed.body.split("\n").find((line) => line.trim().length > 0)?.trim() ?? skillId;

  return {
    skillId,
    name: parsed.body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? String(parsed.frontmatter.name ?? skillId),
    kind,
    category: inferCategory(parsed),
    version,
    description,
    inputSchema: {
      type: "object",
      required: ["command"],
      properties: {
        command: { type: "string" },
        context: { type: "object" }
      }
    },
    outputSchema: {
      type: "object",
      required: ["result"],
      properties: {
        result: { type: "string" }
      }
    },
    blocks: [
      {
        blockId: `${skillId}-prompt`,
        name: "system",
        type: "skill",
        systemPrompt: parsed.systemPrompt
      }
    ],
    isShared: options.isShared ?? true
  };
}
