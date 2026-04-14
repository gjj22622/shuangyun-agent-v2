import { randomUUID } from "node:crypto";
import type { Actor, TraceLog } from "@shuangyun/shared-types";
import type { TraceRepository } from "../repositories/bundle.js";

export type AuditEvent = {
  actor: Actor | null;
  method: string;
  path: string;
  ip: string;
  requestId: string;
  errorCode?: string | null;
  // 部分動作可選帶 clientId（例如 markdown-import）；無 clientId 時寫 NULL。
  clientId?: string | null;
};

function clip(value: string, limit = 240): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}...`;
}

/**
 * 將一筆寫入類請求記錄到 traces 表（phase=auth_audit）。
 *
 * 寫入失敗 MUST NOT 阻擋主流程，僅在 stderr 留下警告，避免 audit 故障導致使用者
 * 看到 500。所有 audit log 都會帶 requestId 與 actorAlias，方便事後追溯。
 */
export function writeAuthAuditTrace(traces: TraceRepository, event: AuditEvent): void {
  try {
    const actorAlias = event.actor?.alias ?? "anonymous";
    const role = event.actor?.role ?? "anonymous";
    const inputSummary = clip(
      `actor=${actorAlias};role=${role};method=${event.method};path=${event.path};ip=${event.ip};request_id=${event.requestId}`
    );
    const outputSummary = event.errorCode ? `result=error:${event.errorCode}` : "result=ok";
    const trace: TraceLog = {
      traceId: randomUUID(),
      taskId: null,
      clientId: event.clientId ?? null,
      phase: "auth_audit",
      stepName: `${event.method} ${event.path}`,
      inputSummary,
      outputSummary,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      errorCode: event.errorCode ?? null
    };
    traces.save(trace);
  } catch (error) {
    console.warn(
      `[audit] 寫入 auth_audit trace 失敗，主流程繼續：${error instanceof Error ? error.message : String(error)}`
    );
  }
}
