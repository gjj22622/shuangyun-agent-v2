import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(databasePath: string): DatabaseSync {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

function listMigrationFiles(): string[] {
  const migrationsDir = resolve(process.cwd(), "packages/orchestrator/src/database");
  return readdirSync(migrationsDir)
    .filter((fileName) => /^\d+_.+\.sql$/.test(fileName))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => resolve(migrationsDir, fileName));
}

export function runMigrations(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      file_name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = database
    .prepare("SELECT file_name FROM schema_migrations")
    .all() as Array<{ file_name: string }>;
  const appliedFiles = new Set(appliedRows.map((row) => row.file_name));
  const insertMigration = database.prepare(
    "INSERT INTO schema_migrations (file_name, applied_at) VALUES (?, ?)"
  );

  for (const filePath of listMigrationFiles()) {
    const fileName = filePath.split(/[/\\]/).at(-1);
    if (!fileName || appliedFiles.has(fileName)) {
      continue;
    }

    database.exec(readFileSync(filePath, "utf8"));
    insertMigration.run(fileName, new Date().toISOString());
  }
}
