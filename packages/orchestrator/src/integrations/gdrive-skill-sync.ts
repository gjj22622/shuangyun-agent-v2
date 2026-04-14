import { Dirent, readdirSync, readFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import type { SkillManifest } from "@shuangyun/shared-types";
import type { RepositoryBundle } from "../repositories/bundle.js";
import {
  buildSkillManifestFromSkillDoc,
  parseSkillDoc,
  parseSkillReferences,
  type ParsedSkillReference
} from "../runtime/skill-doc-parser.js";

const GOOGLE_DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_EXPORT_API = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DOCS_MIME = "application/vnd.google-apps.document";
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

type SkillSyncSource = "gdrive" | "local";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
};

type SyncSkillEntry = {
  skillId: string;
  manifest: SkillManifest;
  references: ParsedSkillReference[];
  sourceRef: string | null;
};

export type SkillSyncResult = {
  source: SkillSyncSource;
  synced: number;
  new: number;
  updated: number;
  archived: number;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少必要環境變數：${name}`);
  }
  return value;
}

function normalizeSkillFolderName(name: string): string {
  return name.trim();
}

async function driveRequest<T>(pathWithQuery: string, accessToken: string): Promise<T> {
  const response = await fetch(pathWithQuery, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Google Drive API 失敗：${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function downloadDriveTextFile(file: DriveFile, accessToken: string): Promise<string> {
  const url =
    file.mimeType === GOOGLE_DOCS_MIME
      ? `${GOOGLE_DRIVE_EXPORT_API}/${encodeURIComponent(file.id)}/export?mimeType=text/plain`
      : `${GOOGLE_DRIVE_FILES_API}/${encodeURIComponent(file.id)}?alt=media`;

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`下載 Google Drive 檔案失敗：${file.name} (${response.status})`);
  }

  return response.text();
}

async function listDriveChildren(parentId: string, accessToken: string): Promise<DriveFile[]> {
  const query = `'${parentId}' in parents and trashed = false`;
  const url = `${GOOGLE_DRIVE_FILES_API}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(
    "files(id,name,mimeType,modifiedTime)"
  )}&pageSize=1000`;
  const payload = await driveRequest<{ files?: DriveFile[] }>(url, accessToken);
  return Array.isArray(payload.files) ? payload.files : [];
}

export async function listSkillFolders(
  folderId = getRequiredEnv("GDRIVE_SKILL_FOLDER_ID"),
  accessToken = getRequiredEnv("GDRIVE_ACCESS_TOKEN")
): Promise<DriveFile[]> {
  const children = await listDriveChildren(folderId, accessToken);
  return children
    .filter((file) => file.mimeType === DRIVE_FOLDER_MIME)
    .map((file) => ({
      ...file,
      name: normalizeSkillFolderName(file.name)
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hant"));
}

export async function downloadSkillMd(
  folderId: string,
  accessToken = getRequiredEnv("GDRIVE_ACCESS_TOKEN")
): Promise<{ file: DriveFile; markdown: string }> {
  const children = await listDriveChildren(folderId, accessToken);
  const skillFile = children.find((file) => file.name.toLowerCase() === "skill.md");
  if (!skillFile) {
    throw new Error(`找不到 SKILL.md：${folderId}`);
  }

  return {
    file: skillFile,
    markdown: await downloadDriveTextFile(skillFile, accessToken)
  };
}

export async function downloadSkillReferences(
  folderId: string,
  accessToken = getRequiredEnv("GDRIVE_ACCESS_TOKEN")
): Promise<Array<{ filename: string; content: string }>> {
  const children = await listDriveChildren(folderId, accessToken);
  const referencesFolder = children.find(
    (file) => file.mimeType === DRIVE_FOLDER_MIME && file.name.toLowerCase() === "references"
  );
  if (!referencesFolder) {
    return [];
  }

  const referenceFiles = (await listDriveChildren(referencesFolder.id, accessToken))
    .filter((file) => file.mimeType !== DRIVE_FOLDER_MIME && file.name.toLowerCase().endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hant"));

  const downloaded = await Promise.all(
    referenceFiles.map(async (file) => ({
      filename: file.name,
      content: await downloadDriveTextFile(file, accessToken)
    }))
  );

  return downloaded;
}

export function syncParsedSkillEntries(
  source: SkillSyncSource,
  repositories: RepositoryBundle,
  entries: SyncSkillEntry[],
  syncedAt = new Date().toISOString()
): SkillSyncResult {
  const nextSkillIds = new Set(entries.map((entry) => entry.skillId));
  const previousSkillIds = new Set(repositories.skillSyncState.listActiveSkillIds(source));
  let createdCount = 0;
  let updatedCount = 0;

  repositories.withTransaction(() => {
    for (const entry of entries) {
      const existed = repositories.skills.findById(entry.skillId) !== null;
      repositories.skills.save(entry.manifest);
      repositories.skillReferences.deleteBySkillId(entry.skillId);
      for (const reference of entry.references) {
        repositories.skillReferences.create({
          skillId: entry.skillId,
          filename: reference.filename,
          content: reference.content,
          updatedAt: syncedAt
        });
      }
      repositories.skillSyncState.markSynced({
        skillId: entry.skillId,
        source,
        sourceRef: entry.sourceRef,
        syncedAt
      });
      if (existed) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    }

    for (const staleSkillId of previousSkillIds) {
      if (nextSkillIds.has(staleSkillId)) {
        continue;
      }
      repositories.skillReferences.deleteBySkillId(staleSkillId);
      repositories.skills.delete(staleSkillId);
      repositories.skillSyncState.archive(staleSkillId, source, syncedAt);
    }
  });

  const archivedCount = [...previousSkillIds].filter((skillId) => !nextSkillIds.has(skillId)).length;
  return {
    source,
    synced: entries.length,
    new: createdCount,
    updated: updatedCount,
    archived: archivedCount
  };
}

export async function syncSkillsFromDrive(
  repositories: RepositoryBundle,
  options: {
    folderId?: string;
    accessToken?: string;
  } = {}
): Promise<SkillSyncResult> {
  const folderId = options.folderId ?? getRequiredEnv("GDRIVE_SKILL_FOLDER_ID");
  const accessToken = options.accessToken ?? getRequiredEnv("GDRIVE_ACCESS_TOKEN");
  const skillFolders = await listSkillFolders(folderId, accessToken);

  const entries = await Promise.all(
    skillFolders.map(async (folder) => {
      const skillDoc = await downloadSkillMd(folder.id, accessToken);
      const parsedDoc = parseSkillDoc(skillDoc.markdown);
      const explicitSkillId = parsedDoc.frontmatter["new-name"] ? String(parsedDoc.frontmatter["new-name"]) : null;
      const manifest = buildSkillManifestFromSkillDoc(parsedDoc, {
        filename: folder.name,
        ...(explicitSkillId ? { skillId: explicitSkillId } : {}),
        isShared: true
      });
      const references = parseSkillReferences(await downloadSkillReferences(folder.id, accessToken));
      return {
        skillId: manifest.skillId,
        manifest,
        references,
        sourceRef: folder.id
      } satisfies SyncSkillEntry;
    })
  );

  return syncParsedSkillEntries("gdrive", repositories, entries);
}

export function buildLocalSkillEntry(
  rootDir: string,
  folderPath: string,
  markdown: string,
  references: Array<{ filename: string; content: string }>
): SyncSkillEntry {
  const parsedDoc = parseSkillDoc(markdown);
  const explicitSkillId = parsedDoc.frontmatter["new-name"] ? String(parsedDoc.frontmatter["new-name"]) : null;
  const manifest = buildSkillManifestFromSkillDoc(parsedDoc, {
    filename: basename(folderPath),
    ...(explicitSkillId ? { skillId: explicitSkillId } : {}),
    isShared: true
  });

  return {
    skillId: manifest.skillId,
    manifest,
    references: parseSkillReferences(references),
    sourceRef: relative(resolve(rootDir), resolve(folderPath)).replaceAll("\\", "/")
  };
}

function listLocalSkillFolders(dirPath: string): Dirent[] {
  return readdirSync(dirPath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
}

function readLocalReferences(folderPath: string): Array<{ filename: string; content: string }> {
  const referencesDir = resolve(folderPath, "references");
  try {
    return readdirSync(referencesDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-Hant"))
      .map((entry) => ({
        filename: entry.name,
        content: readFileSync(resolve(referencesDir, entry.name), "utf8")
      }));
  } catch {
    return [];
  }
}

export function syncSkillsFromLocalDir(dirPath: string, repositories: RepositoryBundle): SkillSyncResult {
  const rootDir = resolve(dirPath);
  const folders = listLocalSkillFolders(rootDir);
  const entries = folders.flatMap((folder) => {
    const folderPath = resolve(rootDir, folder.name);
    const skillDocPath = resolve(folderPath, "SKILL.md");

    try {
      const markdown = readFileSync(skillDocPath, "utf8");
      return [buildLocalSkillEntry(rootDir, folderPath, markdown, readLocalReferences(folderPath))];
    } catch {
      return [];
    }
  });

  return syncParsedSkillEntries("local", repositories, entries);
}
