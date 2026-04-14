import { afterEach, describe, expect, it, vi } from "vitest";
import type { Output } from "@shuangyun/shared-types";
import {
  AppsScriptGoogleFormsAdapter,
  EnvAwareGoogleFormsAdapter,
  StubGoogleFormsAdapter
} from "./google-forms.js";

function makeOutput(): Output {
  return {
    outputId: "output-001",
    taskId: "task-001",
    clientId: "client-001",
    type: "content",
    title: "測試貼文",
    contentBody: "這是一段測試內容",
    assetUrls: [],
    skillUsed: "content-writing",
    review: {
      bossScore: 8,
      bossNote: "ok",
      managerScore: 8,
      managerNote: "ok",
      windowScore: 7,
      windowNote: "ok",
      brandScore: 8,
      brandNote: "ok",
      verdict: "pass",
      confidence: 90,
      reasoningTrace: "trace"
    },
    status: "passed",
    formRowId: null,
    createdAt: "2026-04-07T00:00:00.000Z"
  };
}

describe("google forms adapters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_APPS_SCRIPT_WEBAPP_URL;
    delete process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_SECRET;
  });

  it("StubGoogleFormsAdapter.writeOutput returns stub formRowId", async () => {
    const adapter = new StubGoogleFormsAdapter();
    const row = await adapter.writeOutput("stub-sheet-client-001", makeOutput());

    expect(row.formRowId.startsWith("stub://")).toBe(true);
  });

  it("StubGoogleFormsAdapter.listFeedback returns an empty array", async () => {
    const adapter = new StubGoogleFormsAdapter();
    const feedbacks = await adapter.listFeedback("stub-sheet-client-001");

    expect(feedbacks).toEqual([]);
  });

  it("AppsScriptGoogleFormsAdapter.writeOutput posts write_output action", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sheetId: "sheet-001",
        rowIndex: 12,
        formRowId: "outputs!12"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new AppsScriptGoogleFormsAdapter("https://example.com/webhook", "secret-123");
    await adapter.writeOutput("sheet-001", makeOutput());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("secret=secret-123");
    expect(JSON.parse(String(request.body))).toMatchObject({
      action: "write_output",
      googleSheetId: "sheet-001"
    });
  });

  it("AppsScriptGoogleFormsAdapter.listFeedback sends sinceIso in the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        feedbacks: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new AppsScriptGoogleFormsAdapter("https://example.com/webhook");
    await adapter.listFeedback("sheet-001", "2026-04-07T00:00:00.000Z");

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      action: "list_feedback",
      googleSheetId: "sheet-001",
      sinceIso: "2026-04-07T00:00:00.000Z"
    });
  });

  it("AppsScriptGoogleFormsAdapter throws when Apps Script returns status 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({})
      })
    );

    const adapter = new AppsScriptGoogleFormsAdapter("https://example.com/webhook");
    await expect(adapter.listFeedback("sheet-001")).rejects.toThrow("Apps Script list_feedback failed: 500");
  });

  it("EnvAwareGoogleFormsAdapter delegates to Stub when URL is missing", async () => {
    const adapter = new EnvAwareGoogleFormsAdapter();
    const row = await adapter.writeOutput("stub-sheet-client-001", makeOutput());

    expect(row.formRowId.startsWith("stub://")).toBe(true);
  });
});
