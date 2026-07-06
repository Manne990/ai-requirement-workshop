import {
  attachmentTagsForFile,
  summarizeAttachmentText,
  type AttachmentDraft,
} from "../domain/attachments";

const textExtensions = new Set(["txt", "md", "csv", "json", "log"]);

export async function extractAttachmentDrafts(
  files: File[],
): Promise<AttachmentDraft[]> {
  return Promise.all(files.map(extractAttachmentDraft));
}

async function extractAttachmentDraft(file: File): Promise<AttachmentDraft> {
  const extractedText = await extractFileText(file);
  const status = extractedText.trim() ? "extracted" : "metadata-only";

  return {
    name: file.name,
    mimeType: file.type,
    size: file.size,
    extractedText,
    summary: summarizeAttachmentText(extractedText),
    status,
    tags: attachmentTagsForFile(file.name, file.type),
  };
}

async function extractFileText(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (file.type.startsWith("text/") || textExtensions.has(extension)) {
    return file.text();
  }

  if (extension === "docx") {
    return extractDocxText(file);
  }

  if (extension === "xlsx" || extension === "xls") {
    return extractSpreadsheetText(file);
  }

  return "";
}

async function extractDocxText(file: File) {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractSpreadsheetText(file: File) {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  return sheets
    .map((sheet) =>
      [
        `# ${sheet.sheet}`,
        sheet.data
          .map((row) =>
            row
              .map((cell) =>
                cell === null || cell === undefined ? "" : String(cell),
              )
              .join(","),
          )
          .join("\n"),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n")
    .trim();
}
