import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { authenticateRequest, attachRequestContext, requireAuth, requireCostConfirmation } from "./middleware.js";
import { parsePlatformAccessTokens } from "./token-registry.js";

function makeRequest(headers: Record<string, string> = {}): IncomingMessage {
  return {
    headers,
    socket: {
      remoteAddress: "127.0.0.1"
    }
  } as IncomingMessage;
}

function makeResponse(): ServerResponse {
  return {
    writeHead: vi.fn().mockReturnThis(),
    end: vi.fn()
  } as unknown as ServerResponse;
}

describe("auth middleware", () => {
  const registry = parsePlatformAccessTokens("jacky:admin:token-admin,alice:operator:token-operator,view:viewer:token-viewer");

  it("uses authorization header before cookie", () => {
    const request = makeRequest({
      authorization: "Bearer token-admin",
      cookie: "sy_token=token-viewer"
    });

    const actor = authenticateRequest(request, registry);

    expect(actor?.alias).toBe("jacky");
    expect(attachRequestContext(request).context.requestId).toBeTruthy();
  });

  it("rejects missing token", () => {
    const request = makeRequest();
    const response = makeResponse();

    const allowed = requireAuth(registry, "viewer")(request, response);

    expect(allowed).toBe(false);
    expect(response.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
  });

  it("rejects insufficient role", () => {
    const request = makeRequest({
      authorization: "Bearer token-viewer"
    });
    const response = makeResponse();

    const allowed = requireAuth(registry, "operator")(request, response);

    expect(allowed).toBe(false);
    expect(response.writeHead).toHaveBeenCalledWith(403, expect.any(Object));
  });

  it("accepts valid role", () => {
    const request = makeRequest({
      authorization: "Bearer token-operator"
    });
    const response = makeResponse();

    const allowed = requireAuth(registry, "viewer")(request, response);

    expect(allowed).toBe(true);
    expect(attachRequestContext(request).context.actor?.alias).toBe("alice");
  });

  it("requires explicit cost confirmation header", () => {
    const request = makeRequest();
    const response = makeResponse();

    const allowed = requireCostConfirmation(request, response);

    expect(allowed).toBe(false);
    expect(response.writeHead).toHaveBeenCalledWith(402, expect.any(Object));
  });
});
