import { extname } from "node:path";
import { inflateRawSync } from "node:zlib";

const MAX_CONTENT_BYTES = 50 * 1024;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

export type DocumentParseErrorCode = "UNSUPPORTED_FORMAT" | "DOCX_NOT_SUPPORTED_YET";

export type ParsedDocument =
  | {
      content: string;
      contentLength: number;
      truncated: boolean;
    }
  | {
      error: DocumentParseErrorCode;
    };

export function parseDocument(input: Uint8Array, filename: string): ParsedDocument {
  const extension = extname(filename).toLowerCase();

  if (extension === ".md" || extension === ".txt") {
    const content = Buffer.from(input).toString("utf8");
    return finalizeContent(content);
  }

  if (extension === ".docx") {
    try {
      const documentXml = extractZipEntry(Buffer.from(input), "word/document.xml");
      if (!documentXml) {
        return { error: "DOCX_NOT_SUPPORTED_YET" };
      }

      return finalizeContent(extractDocxText(documentXml.toString("utf8")));
    } catch {
      return { error: "DOCX_NOT_SUPPORTED_YET" };
    }
  }

  return { error: "UNSUPPORTED_FORMAT" };
}

function finalizeContent(content: string): ParsedDocument {
  const contentLength = Buffer.byteLength(content, "utf8");
  if (contentLength <= MAX_CONTENT_BYTES) {
    return {
      content,
      contentLength,
      truncated: false
    };
  }

  return {
    content: truncateUtf8String(content, MAX_CONTENT_BYTES),
    contentLength,
    truncated: true
  };
}

function truncateUtf8String(content: string, maxBytes: number): string {
  let totalBytes = 0;
  let result = "";

  for (const character of content) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (totalBytes + characterBytes > maxBytes) {
      break;
    }
    result += character;
    totalBytes += characterBytes;
  }

  return result;
}

function extractDocxText(documentXml: string): string {
  const normalized = documentXml.replace(/\r/g, "");
  const pieces: string[] = [];
  const tokenPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>|<\/w:p>/g;

  for (const match of normalized.matchAll(tokenPattern)) {
    if (match[1] !== undefined) {
      pieces.push(decodeXmlEntities(match[1]));
      continue;
    }

    if (match[0] === "<w:tab/>") {
      pieces.push("\t");
      continue;
    }

    pieces.push("\n");
  }

  return pieces.join("").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function extractZipEntry(zipBuffer: Buffer, entryName: string): Buffer | null {
  const endOfCentralDirectoryOffset = findEndOfCentralDirectory(zipBuffer);
  if (endOfCentralDirectoryOffset === -1) {
    return null;
  }

  const totalEntries = zipBuffer.readUInt16LE(endOfCentralDirectoryOffset + 10);
  const centralDirectoryOffset = zipBuffer.readUInt32LE(endOfCentralDirectoryOffset + 16);

  let currentOffset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (zipBuffer.readUInt32LE(currentOffset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      return null;
    }

    const compressionMethod = zipBuffer.readUInt16LE(currentOffset + 10);
    const compressedSize = zipBuffer.readUInt32LE(currentOffset + 20);
    const fileNameLength = zipBuffer.readUInt16LE(currentOffset + 28);
    const extraFieldLength = zipBuffer.readUInt16LE(currentOffset + 30);
    const fileCommentLength = zipBuffer.readUInt16LE(currentOffset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(currentOffset + 42);
    const fileNameOffset = currentOffset + 46;
    const currentName = zipBuffer.toString("utf8", fileNameOffset, fileNameOffset + fileNameLength);

    if (currentName === entryName) {
      return readLocalFileData(zipBuffer, localHeaderOffset, compressionMethod, compressedSize);
    }

    currentOffset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return null;
}

function readLocalFileData(
  zipBuffer: Buffer,
  localHeaderOffset: number,
  compressionMethod: number,
  compressedSize: number
): Buffer | null {
  if (zipBuffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    return null;
  }

  const fileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
  const extraFieldLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize);

  if (compressionMethod === 0) {
    return Buffer.from(compressedData);
  }

  if (compressionMethod === 8) {
    return inflateRawSync(compressedData);
  }

  return null;
}

function findEndOfCentralDirectory(zipBuffer: Buffer): number {
  const minimumOffset = Math.max(0, zipBuffer.length - 0xffff - 22);
  for (let offset = zipBuffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (zipBuffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  return -1;
}
