import { createHash } from "node:crypto";
import { actorRoleSchema, actorSchema, type Actor, type ActorRole } from "@shuangyun/shared-types";

export type TokenRegistry = Map<string, Actor>;

type TokenRecord = {
  alias: string;
  role: ActorRole;
  secret: string;
};

function buildTokenHashPrefix(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

function parseTokenRecord(rawToken: string, index: number): TokenRecord {
  const parts = rawToken.split(":");
  if (parts.length !== 3) {
    throw new Error(`PLATFORM_ACCESS_TOKENS 第 ${index + 1} 組格式錯誤，必須為 alias:role:secret`);
  }

  const [rawAlias, rawRole, rawSecret] = parts.map((part) => part.trim());
  if (!rawAlias || !rawRole || !rawSecret) {
    throw new Error(`PLATFORM_ACCESS_TOKENS 第 ${index + 1} 組不可有空白欄位`);
  }

  const roleResult = actorRoleSchema.safeParse(rawRole);
  if (!roleResult.success) {
    throw new Error(`PLATFORM_ACCESS_TOKENS 第 ${index + 1} 組角色無效：${rawRole}`);
  }

  return {
    alias: rawAlias,
    role: roleResult.data,
    secret: rawSecret
  };
}

export function parsePlatformAccessTokens(rawValue: string | undefined): TokenRegistry {
  if (!rawValue?.trim()) {
    throw new Error("PLATFORM_ACCESS_TOKENS 不可為空，至少需提供一組 admin token");
  }

  const tokens = rawValue
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error("PLATFORM_ACCESS_TOKENS 不可為空，至少需提供一組 admin token");
  }

  const registry = new Map<string, Actor>();
  const aliases = new Set<string>();
  let hasAdmin = false;

  for (const [index, rawToken] of tokens.entries()) {
    const record = parseTokenRecord(rawToken, index);
    if (aliases.has(record.alias)) {
      throw new Error(`PLATFORM_ACCESS_TOKENS alias 重複：${record.alias}`);
    }
    if (registry.has(record.secret)) {
      throw new Error(`PLATFORM_ACCESS_TOKENS token 重複：${record.alias}`);
    }

    const actor = actorSchema.parse({
      alias: record.alias,
      role: record.role,
      tokenHashPrefix: buildTokenHashPrefix(record.secret)
    });
    registry.set(record.secret, actor);
    aliases.add(record.alias);
    hasAdmin ||= record.role === "admin";
  }

  if (!hasAdmin) {
    throw new Error("PLATFORM_ACCESS_TOKENS 至少需提供一組 admin token");
  }

  return registry;
}

export function resolveActorFromToken(registry: TokenRegistry, token: string | null | undefined): Actor | null {
  if (!token) {
    return null;
  }
  return registry.get(token.trim()) ?? null;
}
