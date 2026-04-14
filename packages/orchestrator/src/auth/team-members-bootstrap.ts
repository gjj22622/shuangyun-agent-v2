import { createHash } from "node:crypto";
import type { TeamMemberRepository } from "../repositories/bundle.js";
import type { TokenRegistry } from "./token-registry.js";

function nowIso(): string {
  return new Date().toISOString();
}

export class MemberArchivedError extends Error {
  constructor(
    public readonly alias: string,
    public readonly memberId: string
  ) {
    super("此帳號已停用");
    this.name = "MemberArchivedError";
  }
}

export function memberIdFromAlias(alias: string): string {
  const normalized = alias.trim().toLowerCase();
  return `mbr_${createHash("sha256").update(normalized).digest("hex").slice(0, 10)}`;
}

export function ensureTeamMembersFromTokens(tokenRegistry: TokenRegistry, teamMembers: TeamMemberRepository): { ensured: number } {
  let ensured = 0;
  const timestamp = nowIso();

  for (const actor of tokenRegistry.values()) {
    const existing = teamMembers.getByAlias(actor.alias);
    teamMembers.upsert({
      memberId: existing?.memberId ?? memberIdFromAlias(actor.alias),
      alias: actor.alias,
      displayName: existing?.displayName ?? actor.alias,
      role: actor.role,
      email: existing?.email ?? null,
      status: existing?.status ?? "active",
      joinedAt: existing?.joinedAt ?? timestamp,
      lastSeenAt: timestamp,
      notes: existing?.notes ?? []
    });
    ensured += 1;
  }

  return { ensured };
}
