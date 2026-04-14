import { request as httpRequest } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase, runMigrations } from "./database/sqlite.js";
import { StubGoogleFormsAdapter } from "./integrations/google-forms.js";
import { createRepositoryBundle } from "./repositories/bundle.js";
import { startStatusServer } from "./server.js";

type HttpResponse = {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
};

async function getFirstClientId(port: number): Promise<string> {
  const response = await sendRequest(port, "/api/clients");
  const json = JSON.parse(response.body) as { clients: Array<{ clientId: string }> };
  const clientId = json.clients[0]?.clientId;
  if (!clientId) {
    throw new Error("Expected at least one client");
  }
  return clientId;
}

function makeOnboardingPayload() {
  return {
    brandName: "測試品牌股份有限公司",
    industry: "AI 顧問",
    primaryGoal: "30 天內建立第一波名單蒐集漏斗",
    targetAudience: "品牌經理與中小企業主",
    keyOffer: "AI 行銷導入顧問與代營運服務",
    toneOfVoice: "專業、直接、有顧問感",
    bannedTopics: "避免政治、避免誇大保證",
    preferredChannels: ["FB", "LINE"],
    contentCadence: "每週 3 篇貼文",
    campaignWindow: "2026-04-15 to 2026-05-15",
    currentPainPoint: "內容產出過慢且缺乏固定追蹤",
    successMetric: "名單 50 筆、成交 5 家",
    ownerName: "測試負責人",
    ownerEmail: "owner@example.com"
  };
}

function sendRequest(
  port: number,
  path: string,
  method = "GET",
  body?: string,
  headers: Record<string, string> = {}
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers
          });
        });
      }
    );

    request.on("error", reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

describe("status server UI routes", () => {
  const database = openDatabase(":memory:");
  runMigrations(database);
  const repositories = createRepositoryBundle(database);
  const formsAdapter = new StubGoogleFormsAdapter();

  let port = 0;
  let server: Awaited<ReturnType<typeof startStatusServer>>;

  beforeAll(async () => {
    server = await startStatusServer("127.0.0.1", 0, repositories, formsAdapter);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server address not available");
    }
    port = address.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    database.close();
  });

  it("GET /onboarding returns HTML with all 14 field names", async () => {
    const response = await sendRequest(port, "/onboarding");

    expect(response.statusCode).toBe(200);
    expect(String(response.headers["content-type"])).toContain("text/html");

    const fieldNames = [
      "brandName",
      "industry",
      "primaryGoal",
      "targetAudience",
      "keyOffer",
      "toneOfVoice",
      "bannedTopics",
      "preferredChannels",
      "contentCadence",
      "campaignWindow",
      "currentPainPoint",
      "successMetric",
      "ownerName",
      "ownerEmail"
    ];

    for (const fieldName of fieldNames) {
      expect(response.body).toContain(`name="${fieldName}"`);
    }
  });

  it("POST /api/onboarding returns 201 with clientId", async () => {
    const payload = makeOnboardingPayload();
    const response = await sendRequest(port, "/api/onboarding", "POST", JSON.stringify(payload), {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(JSON.stringify(payload)))
    });

    expect(response.statusCode).toBe(201);

    const json = JSON.parse(response.body) as {
      ok: boolean;
      clientId: string;
      brainId: string;
      brandName: string;
      googleFormUrl: string | null;
    };

    expect(json.ok).toBe(true);
    expect(json.clientId).toMatch(/^client_/);
    expect(json.brandName).toBe(payload.brandName);
    expect(json.googleFormUrl).toBeTruthy();
    expect(json.brainId).toMatch(/^brain_/);
  });

  it("POST /api/onboarding rejects missing brandName", async () => {
    const payload = {
      ...makeOnboardingPayload(),
      brandName: undefined
    };
    const body = JSON.stringify(payload);
    const response = await sendRequest(port, "/api/onboarding", "POST", body, {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body))
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.body) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toContain("brandName");
  });

  it("GET / includes link to onboarding page", async () => {
    const response = await sendRequest(port, "/");

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('href="/onboarding"');
    expect(response.body).toContain("+ 新增客戶");
  });

  it("GET /database returns markdown import UI", async () => {
    const response = await sendRequest(port, "/database");

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("品牌資料庫總覽");
    expect(response.body).toContain("Markdown 匯入");
  });

  it("POST /api/clients/:clientId/markdown-import writes task and output into sqlite", async () => {
    const clientId = await getFirstClientId(port);
    const payload = {
      filename: "launch-plan.md",
      markdown: ["---", "title: 四月品牌主題企劃", "---", "# 四月品牌主題企劃", "", "- 內容主軸：AI 行銷部門導入", "- CTA：預約診斷"].join("\n")
    };
    const body = JSON.stringify(payload);

    const response = await sendRequest(port, `/api/clients/${clientId}/markdown-import`, "POST", body, {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body))
    });

    expect(response.statusCode).toBe(201);
    const json = JSON.parse(response.body) as { ok: boolean; taskId: string; outputId: string; title: string };
    expect(json.ok).toBe(true);
    expect(json.taskId).toBeTruthy();
    expect(json.outputId).toBeTruthy();
    expect(json.title).toBe("四月品牌主題企劃");

    const clientPayload = JSON.parse((await sendRequest(port, `/api/clients/${clientId}`)).body) as {
      outputs: Array<{ outputId: string; title: string; skillUsed: string }>;
      tasks: Array<{ taskId: string; status: string }>;
    };
    expect(clientPayload.outputs.some((output) => output.outputId === json.outputId && output.skillUsed === "markdown-import")).toBe(true);
    expect(clientPayload.tasks.some((task) => task.taskId === json.taskId && task.status === "done")).toBe(true);
  });

  it("GET /database/:clientId shows profile sheet and output detail page shows markdown", async () => {
    const clientId = await getFirstClientId(port);
    const clientPage = await sendRequest(port, `/database/${clientId}`);

    expect(clientPage.statusCode).toBe(200);
    expect(clientPage.body).toContain("Profile Sheet");
    expect(clientPage.body).toContain("輸出清單");

    const clientPayload = JSON.parse((await sendRequest(port, `/api/clients/${clientId}`)).body) as {
      outputs: Array<{ outputId: string; title: string }>;
    };
    const outputId = clientPayload.outputs[0]?.outputId;
    expect(outputId).toBeTruthy();

    const detailPage = await sendRequest(port, `/database/${clientId}/outputs/${outputId}`);
    expect(detailPage.statusCode).toBe(200);
    expect(detailPage.body).toContain("Detail Page");
    expect(detailPage.body).toContain("Markdown 原文");
  });
});
