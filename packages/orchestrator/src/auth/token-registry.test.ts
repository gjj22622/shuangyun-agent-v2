import { describe, expect, it } from "vitest";
import { parsePlatformAccessTokens, resolveActorFromToken } from "./token-registry.js";

describe("token registry", () => {
  it("rejects empty token list", () => {
    expect(() => parsePlatformAccessTokens("")).toThrow(/PLATFORM_ACCESS_TOKENS 不可為空/);
  });

  it("rejects duplicate alias", () => {
    expect(() => parsePlatformAccessTokens("jacky:admin:token-1,jacky:viewer:token-2")).toThrow(/alias 重複/);
  });

  it("rejects missing admin token", () => {
    expect(() => parsePlatformAccessTokens("alice:viewer:token-1,bob:operator:token-2")).toThrow(/至少需提供一組 admin token/);
  });

  it("rejects invalid token format", () => {
    expect(() => parsePlatformAccessTokens("broken-token")).toThrow(/格式錯誤/);
  });

  it("parses valid token list and resolves actor", () => {
    const registry = parsePlatformAccessTokens("jacky:admin:token-1,alice:operator:token-2");
    const actor = resolveActorFromToken(registry, "token-2");

    expect(actor).toMatchObject({
      alias: "alice",
      role: "operator"
    });
    expect(actor?.tokenHashPrefix).toHaveLength(12);
  });
});
