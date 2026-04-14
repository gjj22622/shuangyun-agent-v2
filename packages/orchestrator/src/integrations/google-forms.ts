import type { FeedbackType, OnboardingPayload, Output } from "@shuangyun/shared-types";

export const GOOGLE_FORMS_SYMBOLIC_COST_USD = 0.0001;
export const GOOGLE_FORMS_MODEL_NAME = "google-apps-script";

export type CreatedBrandForm = {
  googleFormUrl: string | null;
  googleSheetId: string | null;
};

export type FormRowReference = {
  sheetId: string;
  rowIndex: number;
  formRowId: string;
};

export type FeedbackRecord = {
  rowIndex: number;
  submittedAt: string;
  clientId: string;
  outputId: string | null;
  feedbackType: FeedbackType;
  content: string;
  submittedBy: string;
};

export interface GoogleFormsAdapter {
  createBrandForm(clientId: string, payload: OnboardingPayload): Promise<CreatedBrandForm>;
  writeOutput(sheetId: string, output: Output): Promise<FormRowReference>;
  listFeedback(sheetId: string, sinceIso?: string): Promise<FeedbackRecord[]>;
}

export class StubGoogleFormsAdapter implements GoogleFormsAdapter {
  async createBrandForm(clientId: string, _payload: OnboardingPayload): Promise<CreatedBrandForm> {
    return {
      googleFormUrl: `stub://forms/${clientId}`,
      googleSheetId: `stub-sheet-${clientId}`
    };
  }

  async writeOutput(sheetId: string, output: Output): Promise<FormRowReference> {
    const rowIndex = Date.now() % 10000;
    return {
      sheetId,
      rowIndex,
      formRowId: `stub://${sheetId}#${output.outputId}`
    };
  }

  async listFeedback(_sheetId: string, _sinceIso?: string): Promise<FeedbackRecord[]> {
    return [];
  }
}

export class EnvAwareGoogleFormsAdapter implements GoogleFormsAdapter {
  private readonly delegate: GoogleFormsAdapter;

  constructor() {
    const webAppUrl = process.env.GOOGLE_APPS_SCRIPT_WEBAPP_URL;
    const webhookSecret = process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_SECRET;
    this.delegate = webAppUrl ? new AppsScriptGoogleFormsAdapter(webAppUrl, webhookSecret) : new StubGoogleFormsAdapter();
  }

  async createBrandForm(clientId: string, payload: OnboardingPayload): Promise<CreatedBrandForm> {
    return this.delegate.createBrandForm(clientId, payload);
  }

  async writeOutput(sheetId: string, output: Output): Promise<FormRowReference> {
    return this.delegate.writeOutput(sheetId, output);
  }

  async listFeedback(sheetId: string, sinceIso?: string): Promise<FeedbackRecord[]> {
    return this.delegate.listFeedback(sheetId, sinceIso);
  }
}

export class AppsScriptGoogleFormsAdapter implements GoogleFormsAdapter {
  constructor(
    private readonly webAppUrl: string,
    private readonly webhookSecret?: string
  ) {}

  private buildRequestUrl(): string {
    return this.webhookSecret
      ? `${this.webAppUrl}${this.webAppUrl.includes("?") ? "&" : "?"}secret=${encodeURIComponent(this.webhookSecret)}`
      : this.webAppUrl;
  }

  private async post<T>(action: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.buildRequestUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action,
        ...body
      })
    });

    if (!response.ok) {
      throw new Error(`Apps Script ${action} failed: ${response.status}`);
    }

    const json = (await response.json()) as { statusCode?: number } & T;
    if (typeof json.statusCode === "number" && json.statusCode >= 400) {
      throw new Error(`Apps Script ${action} failed: ${json.statusCode}`);
    }

    return json;
  }

  async createBrandForm(clientId: string, payload: OnboardingPayload): Promise<CreatedBrandForm> {
    const json = await this.post<Partial<CreatedBrandForm>>("create_brand_form", {
      clientId,
      payload
    });

    return {
      googleFormUrl: json.googleFormUrl ?? null,
      googleSheetId: json.googleSheetId ?? null
    };
  }

  async writeOutput(sheetId: string, output: Output): Promise<FormRowReference> {
    const json = await this.post<FormRowReference>("write_output", {
      googleSheetId: sheetId,
      output
    });

    return {
      sheetId: json.sheetId,
      rowIndex: json.rowIndex,
      formRowId: json.formRowId
    };
  }

  async listFeedback(sheetId: string, sinceIso?: string): Promise<FeedbackRecord[]> {
    const json = await this.post<{ feedbacks?: FeedbackRecord[] }>("list_feedback", {
      googleSheetId: sheetId,
      sinceIso: sinceIso ?? null
    });

    return Array.isArray(json.feedbacks) ? json.feedbacks : [];
  }
}
