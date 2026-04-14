import { deflateRawSync } from "node:zlib";
import assert from "node:assert/strict";
import { parseDocument } from "../../dist/runtime/document-parser.js";

const CRC32_TABLE = new Uint32Array(
  Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let round = 0; round < 8; round += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  })
);

runTest("解析 markdown 為 UTF-8 文字", () => {
  const result = parseDocument(Buffer.from("# 品牌腦\n這是一份測試文件", "utf8"), "brand.md");

  assert.equal("error" in result, false);
  if ("error" in result) {
    return;
  }

  assert.match(result.content, /品牌腦/u);
  assert.equal(result.contentLength, Buffer.byteLength("# 品牌腦\n這是一份測試文件", "utf8"));
  assert.equal(result.truncated, false);
});

runTest("解析 txt 檔並在超過 50KB 時截斷", () => {
  const source = "a".repeat(60 * 1024);
  const result = parseDocument(Buffer.from(source, "utf8"), "notes.txt");

  assert.equal("error" in result, false);
  if ("error" in result) {
    return;
  }

  assert.equal(result.contentLength, Buffer.byteLength(source, "utf8"));
  assert.equal(Buffer.byteLength(result.content, "utf8"), 50 * 1024);
  assert.equal(result.truncated, true);
});

runTest("解析 docx 的 word/document.xml 文字節點", () => {
  const docx = createDocxBuffer(
    [
      "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
      "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
      "<w:body>",
      "<w:p><w:r><w:t>第一段</w:t></w:r></w:p>",
      "<w:p><w:r><w:t xml:space=\"preserve\">第二段 &amp; 測試</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>完成</w:t></w:r></w:p>",
      "</w:body>",
      "</w:document>"
    ].join("")
  );

  const result = parseDocument(docx, "meeting.docx");

  assert.equal("error" in result, false);
  if ("error" in result) {
    return;
  }

  assert.equal(result.content, "第一段\n第二段 & 測試\t完成");
  assert.equal(result.truncated, false);
});

runTest("不支援的格式回傳 UNSUPPORTED_FORMAT", () => {
  const result = parseDocument(Buffer.from("pdf"), "spec.pdf");
  assert.deepEqual(result, { error: "UNSUPPORTED_FORMAT" });
});

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function createDocxBuffer(documentXml) {
  return createZipBuffer([
    {
      name: "[Content_Types].xml",
      content: Buffer.from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"></Types>",
        "utf8"
      ),
      compressionMethod: 0
    },
    {
      name: "word/document.xml",
      content: Buffer.from(documentXml, "utf8"),
      compressionMethod: 8
    }
  ]);
}

function createZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.name, "utf8");
    const compressedContent = entry.compressionMethod === 8 ? deflateRawSync(entry.content) : entry.content;
    const crc32 = calculateCrc32(entry.content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(entry.compressionMethod, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc32, 14);
    localHeader.writeUInt32LE(compressedContent.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, fileName, compressedContent);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(entry.compressionMethod, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc32, 16);
    centralHeader.writeUInt32LE(compressedContent.length, 20);
    centralHeader.writeUInt32LE(entry.content.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    centralParts.push(centralHeader, fileName);
    localOffset += localHeader.length + fileName.length + compressedContent.length;
  }

  const centralDirectoryOffset = localOffset;
  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

function calculateCrc32(buffer) {
  let crc = 0xffffffff;

  for (const value of buffer) {
    crc = CRC32_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
