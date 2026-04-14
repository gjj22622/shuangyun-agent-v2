import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SkillManifest } from "@shuangyun/shared-types";

export const sharedSkillIds = [
  "content-writing",
  "image-generation",
  "video-script",
  "marketing-plan",
  "ads-strategy",
  "weekly-report",
  "compliance-check",
  "brand-voice",
  "schedule-query"
] as const;

export function isSharedSkill(skillId: string): boolean {
  return sharedSkillIds.includes(skillId as (typeof sharedSkillIds)[number]);
}

export function describeSkill(skill: SkillManifest): string {
  return `${skill.skillId}@${skill.version} (${skill.kind})`;
}

export type LocalSkillSource = {
  skillId: string;
  filePath: string;
  contents: string;
};

export function loadLocalSkillSources(skillRoot: string): LocalSkillSource[] {
  const resolvedRoot = resolve(skillRoot);
  if (!existsSync(resolvedRoot)) {
    return [];
  }

  const collected: LocalSkillSource[] = [];

  for (const entry of readdirSync(resolvedRoot, { withFileTypes: true })) {
    const absolutePath = join(resolvedRoot, entry.name);
    if (entry.isFile() && (entry.name.endsWith(".skill") || entry.name === "SKILL.md")) {
      collected.push({
        skillId: entry.name.replace(/(\.skill|\.md)$/u, ""),
        filePath: absolutePath,
        contents: readFileSync(absolutePath, "utf8")
      });
    }
  }

  return collected;
}

export type SkillSandbox = {
  clientId: string;
  allowedSkillIds: string[];
};

export function createSkillSandbox(clientId: string, allowedSkillIds: string[]): SkillSandbox {
  return {
    clientId,
    allowedSkillIds
  };
}

export function assertSkillAllowed(sandbox: SkillSandbox, skillId: string): void {
  if (!sandbox.allowedSkillIds.includes(skillId)) {
    throw new Error(`Skill ${skillId} is not allowed in sandbox for client ${sandbox.clientId}.`);
  }
}
