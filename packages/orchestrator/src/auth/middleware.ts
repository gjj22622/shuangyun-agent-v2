import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Actor, ActorRole } from "@shuangyun/shared-types";
import type { TokenRegistry } from "./token-registry.js";
import { resolveActorFromToken } from "./token-registry.js";

export type RequestContext = {
  actor: Actor | null;
  requestId: string;
};

export type AuthenticatedRequest = IncomingMessage & {
  context: RequestContext;
};

const ROLE_WEIGHT: Record<ActorRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3
};

type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) {
    return cookies;
  }

  for (const pair of header.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (name) {
      cookies.set(name, decodeURIComponent(value));
    }
  }

  return cookies;
}

function extractBearerToken(headerValue: string | string[] | undefined): string | null {
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim() || null;
}

export function attachRequestContext(request: IncomingMessage): AuthenticatedRequest {
  const authRequest = request as AuthenticatedRequest;
  authRequest.context ??= {
    actor: null,
    requestId: randomUUID()
  };
  return authRequest;
}

export function getAuthToken(request: IncomingMessage): string | null {
  const headerToken = extractBearerToken(request.headers.authorization);
  if (headerToken) {
    return headerToken;
  }

  const cookieHeader = Array.isArray(request.headers.cookie) ? request.headers.cookie.join(";") : request.headers.cookie;
  return parseCookies(cookieHeader).get("sy_token") ?? null;
}

export function authenticateRequest(request: IncomingMessage, tokenRegistry: TokenRegistry): Actor | null {
  const authRequest = attachRequestContext(request);
  const actor = resolveActorFromToken(tokenRegistry, getAuthToken(authRequest));
  authRequest.context.actor = actor;
  return actor;
}

export function sendErrorResponse(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  const body: ErrorBody = {
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  };

  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body, null, 2));
}

export function requireAuth(tokenRegistry: TokenRegistry, requiredRole: ActorRole = "viewer") {
  return (request: IncomingMessage, response: ServerResponse): request is AuthenticatedRequest & { context: RequestContext & { actor: Actor } } => {
    const actor = authenticateRequest(request, tokenRegistry);
    if (!actor) {
      sendErrorResponse(response, 401, "INVALID_TOKEN", "Token 無效、缺失或已過期。");
      return false;
    }

    if (ROLE_WEIGHT[actor.role] < ROLE_WEIGHT[requiredRole]) {
      sendErrorResponse(response, 403, "INSUFFICIENT_ROLE", "目前 Token 權限不足，無法執行此動作。", {
        requiredRole,
        actualRole: actor.role
      });
      return false;
    }

    return true;
  };
}

export function requireCostConfirmation(request: IncomingMessage, response: ServerResponse): boolean {
  if ((request.headers["x-confirm-cost"] ?? "").toString().trim().toLowerCase() === "true") {
    return true;
  }

  sendErrorResponse(response, 402, "COST_CONFIRMATION_REQUIRED", "此動作會產生 API 費用，請帶上 X-Confirm-Cost: true 後再重試。");
  return false;
}

export function getRequestIp(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (value?.trim()) {
    return value.split(",")[0]?.trim() || "unknown";
  }
  return request.socket.remoteAddress ?? "unknown";
}
