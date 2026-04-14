import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MasterCase } from "@shuangyun/shared-types";
import { pollFeedback, runDemoTask, runSampleOnboarding, verifyFormIntegration } from "./app.js";
import { getRuntimeEnv, loadRuntimeEnvFile } from "./database/env.js";
import { openDatabase, runMigrations } from "./database/sqlite.js";
import { syncSkillsFromDrive, syncSkillsFromLocalDir, type SkillSyncResult } from "./integrations/gdrive-skill-sync.js";
import { EnvAwareGoogleFormsAdapter } from "./integrations/google-forms.js";
import { createRepositoryBundle, type RepositoryBundle } from "./repositories/bundle.js";
import { seedFoundations } from "./seed/bootstrap.js";
import { defaultSkillCatalog } from "./seed/catalog.js";
import { startStatusServer } from "./server.js";

/**
 * 確保 skill catalog 存在於 DB（每次啟動 idempotent ensure）。
 * 不會建立 sample client，避免污染真實 onboarding 資料。
 * 設計理由：skill catalog 是基礎設施，任何環境都該有；client 是真實資料，必須走 onboarding。
 */
function ensureSkillCatalog(repositories: RepositoryBundle): { added: number } {
  let added = 0;
  for (const skill of defaultSkillCatalog) {
    if (!repositories.skills.findById(skill.skillId)) {
      repositories.skills.save(skill);
      added += 1;
    }
  }
  return { added };
}

/**
 * 確保師傅腦的 Jacky SKILL.md 資料存在於 master_cases（每次啟動 idempotent ensure）。
 * 讀取 packages/orchestrator/src/seed/jacky-master-cases.json（由
 * tools/jacky-skills-loader/export-to-json.mjs 產出）並注入。
 * 無論 local 或 Zeabur，啟動後都會自動有 7 筆 jacky skill 當師傅腦案例。
 */
function ensureJackyMasterCases(repositories: RepositoryBundle): { added: number } {
  const candidates: string[] = [
    resolve(process.cwd(), "packages/orchestrator/src/seed/jacky-master-cases.json"),
    resolve(process.cwd(), "packages/orchestrator/dist/seed/jacky-master-cases.json")
  ];

  let raw: string | null = null;
  for (const candidate of candidates) {
    try {
      raw = readFileSync(candidate, "utf8");
      break;
    } catch {
      // 繼續嘗試下一個候選路徑
    }
  }

  if (!raw) {
    console.warn("ensureJackyMasterCases: 找不到 jacky-master-cases.json，跳過師傅腦預載");
    return { added: 0 };
  }

  const cases = JSON.parse(raw) as MasterCase[];
  let added = 0;
  for (const masterCase of cases) {
    if (!repositories.masterCases.getById(masterCase.caseId)) {
      repositories.masterCases.create(masterCase);
      added += 1;
    }
  }
  return { added };
}

async function syncSkillsOnBoot(
  repositories: RepositoryBundle,
  env: ReturnType<typeof getRuntimeEnv>
): Promise<SkillSyncResult | null> {
  try {
    if (env.skillSource === "local") {
      if (!env.skillLocalDir) {
        throw new Error("SKILL_SOURCE=local 時必須設定 SKILL_LOCAL_DIR");
      }
      return syncSkillsFromLocalDir(env.skillLocalDir, repositories);
    }

    return await syncSkillsFromDrive(repositories);
  } catch (error) {
    console.warn(`Skill sync skipped: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

loadRuntimeEnvFile();

async function main(): Promise<void> {
  const command = process.argv[2] ?? "status";
  const env = getRuntimeEnv();
  const database = openDatabase(env.databasePath);
  runMigrations(database);
  const repositories = createRepositoryBundle(database);
  const formsAdapter = new EnvAwareGoogleFormsAdapter();

  if (command !== "migrate") {
    const syncResult = await syncSkillsOnBoot(repositories, env);
    if (syncResult) {
      console.log(
        `synced ${syncResult.synced} skills (new: ${syncResult.new}, updated: ${syncResult.updated}, archived: ${syncResult.archived})`
      );
    }
  }

  switch (command) {
    case "migrate":
      console.log(`Migration complete: ${env.databasePath}`);
      console.log(JSON.stringify(repositories.snapshot(), null, 2));
      break;
    case "seed":
      seedFoundations(repositories);
      console.log("Seed complete.");
      console.log(JSON.stringify(repositories.snapshot(), null, 2));
      break;
    case "onboard-sample": {
      const result = await runSampleOnboarding(repositories, formsAdapter);

      console.log(
        JSON.stringify(
          {
            clientId: result.client.clientId,
            brainId: result.brandBrain.brainId,
            traces: result.traces.length,
            snapshot: repositories.snapshot()
          },
          null,
          2
        )
      );
      break;
    }
    case "demo-task": {
      const result = await runDemoTask(repositories, formsAdapter);

      console.log(
        JSON.stringify(
          {
            ...result,
            snapshot: repositories.snapshot()
          },
          null,
          2
        )
      );
      break;
    }
    case "verify-form-integration": {
      const clientId = process.argv[3];
      if (!clientId) {
        throw new Error("Usage: verify-form-integration <clientId>");
      }

      const result = await verifyFormIntegration(repositories, formsAdapter, clientId);
      console.log(
        JSON.stringify(
          {
            clientId: result.clientId,
            sheetId: result.sheetId,
            formRowId: result.dispatch.output.formRowId,
            outputId: result.dispatch.outputId,
            totalFeedbacks: result.totalFeedbacks,
            report: result.report,
            snapshot: repositories.snapshot()
          },
          null,
          2
        )
      );
      break;
    }
    case "poll-feedback": {
      const clientId = process.argv[3];
      if (!clientId) {
        throw new Error("Usage: poll-feedback <clientId>");
      }

      const result = await pollFeedback(repositories, formsAdapter, clientId);
      console.log(JSON.stringify({ ...result, snapshot: repositories.snapshot() }, null, 2));
      break;
    }
    case "serve": {
      const ensuredSkills = ensureSkillCatalog(repositories);
      if (ensuredSkills.added > 0) {
        console.log(`Ensured skill catalog: added ${ensuredSkills.added} default skills.`);
      }
      const ensuredMasterCases = ensureJackyMasterCases(repositories);
      if (ensuredMasterCases.added > 0) {
        console.log(`Ensured master brain: added ${ensuredMasterCases.added} jacky skill cases.`);
      }
      await startStatusServer(env.appHost, env.appPort, repositories, formsAdapter);
      break;
    }
    case "status":
    default:
      console.log(JSON.stringify(repositories.snapshot(), null, 2));
      break;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
