import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type RuntimeEnv = {
  appEnv: string;
  appHost: string;
  appPort: number;
  databasePath: string;
  skillSource: "gdrive" | "local";
  skillLocalDir: string | null;
};

export function loadRuntimeEnvFile(
  loadEnvFile: (() => void) | undefined = process.loadEnvFile?.bind(process)
): { appEnv: string; loaded: boolean } {
  const appEnv = process.env.APP_ENV?.trim() || "development";
  if (appEnv === "production") {
    return { appEnv, loaded: false };
  }

  if (!loadEnvFile) {
    return { appEnv, loaded: false };
  }

  try {
    loadEnvFile();
    return { appEnv: process.env.APP_ENV?.trim() || appEnv, loaded: true };
  } catch {
    return { appEnv, loaded: false };
  }
}

export function getRuntimeEnv(): RuntimeEnv {
  const databasePath = resolve(process.cwd(), process.env.DATABASE_PATH ?? "./data/shuangyun-agent.db");
  mkdirSync(dirname(databasePath), { recursive: true });

  return {
    appEnv: process.env.APP_ENV?.trim() || "development",
    appHost: process.env.APP_HOST ?? "0.0.0.0",
    appPort: Number(process.env.APP_PORT ?? "8000"),
    databasePath,
    skillSource: process.env.SKILL_SOURCE?.trim() === "local" ? "local" : "gdrive",
    skillLocalDir: process.env.SKILL_LOCAL_DIR?.trim() || null
  };
}
