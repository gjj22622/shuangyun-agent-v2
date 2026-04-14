import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { z } from "zod";
import type { Output, SkillManifest, Task, TraceLog } from "@shuangyun/shared-types";
import type { RepositoryBundle } from "../repositories/bundle.js";

const markdownImportPayloadSchema = z.object({
  filename: z.string().min(1),
  markdown: z.string().min(1)
});

type MarkdownImportPayload = z.infer<typeof markdownImportPayloadSchema>;

function nowIso(): string {
  return new Date().toISOString();
}

function stripFrontmatter(markdown: string): { metadata: Record<string, string>; body: string } {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { metadata: {}, body: normalized.trim() };
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return { metadata: {}, body: normalized.trim() };
  }

  const rawMetadata = normalized.slice(4, closingIndex).split("\n");
  const metadata: Record<string, string> = {};

  for (const line of rawMetadata) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      metadata[key] = value;
    }
  }

  return {
    metadata,
    body: normalized.slice(closingIndex + "\n---\n".length).trim()
  };
}

function inferTitle(filename: string, markdownBody: string, metadata: Record<string, string>): string {
  if (metadata.title) {
    return metadata.title;
  }

  const heading = markdownBody
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));

  if (heading) {
    return heading.replace(/^#\s+/, "").trim();
  }

  return basename(filename, ".md");
}

function ensureImportSkill(repositories: RepositoryBundle): void {
  if (repositories.skills.findById("content-writing")) {
    return;
  }

  const skill: SkillManifest = {
    skillId: "content-writing",
    name: "內容產出 Skill",
    kind: "workflow",
    category: "content_writing",
    version: "0.1.0",
    description: "供 Markdown 匯入與示範內容任務使用的內容產出 skill placeholder。",
    inputSchema: {
      title: "string",
      markdown: "string"
    },
    outputSchema: {
      contentBody: "string"
    },
    blocks: [
      {
        blockId: "input",
        name: "input",
        type: "input",
        systemPrompt: "接收 markdown 內容。"
      },
      {
        blockId: "output",
        name: "output",
        type: "output",
        systemPrompt: "輸出整理後內容。"
      }
    ],
    isShared: true
  };

  repositories.skills.save(skill);
}

export function importMarkdownDocument(
  repositories: RepositoryBundle,
  clientId: string,
  rawPayload: MarkdownImportPayload
): { task: Task; output: Output; trace: TraceLog } {
  const client = repositories.clients.getById(clientId);
  if (!client) {
    throw new Error(`Client ${clientId} not found.`);
  }

  const payload = markdownImportPayloadSchema.parse(rawPayload);
  const { metadata, body } = stripFrontmatter(payload.markdown);
  const title = inferTitle(payload.filename, body, metadata);
  const createdAt = metadata.created_at ?? nowIso();
  const completedAt = nowIso();

  ensureImportSkill(repositories);

  const task: Task = {
    taskId: randomUUID(),
    clientId,
    title: `Markdown 匯入：${title}`,
    type: "content",
    skillId: "content-writing",
    status: "done",
    createdBy: "partner",
    createdAt,
    dueAt: null,
    completedAt,
    assignee: "markdown-import",
    progress: 100,
    resultFormRowId: null
  };

  const output: Output = {
    outputId: randomUUID(),
    taskId: task.taskId,
    clientId,
    type: "content",
    title,
    contentBody: body,
    assetUrls: [],
    skillUsed: "markdown-import",
    review: null,
    status: "draft",
    formRowId: null,
    createdAt
  };

  const trace: TraceLog = {
    traceId: randomUUID(),
    taskId: task.taskId,
    clientId,
    phase: "form_write",
    stepName: "markdown_import",
    inputSummary: `filename=${payload.filename};title=${title}`,
    outputSummary: `outputId=${output.outputId};status=${output.status}`,
    startedAt: completedAt,
    endedAt: completedAt,
    errorCode: null
  };

  repositories.tasks.create(task);
  repositories.outputs.save(output);
  repositories.traces.save(trace);

  return { task, output, trace };
}
