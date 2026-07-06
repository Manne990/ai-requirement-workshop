import {
  attachmentTagsForFile,
  summarizeAttachmentText,
  type AttachmentDraft,
  type AttachmentExtractionStatus,
} from "../domain/attachments";
import {
  defaultAttachmentSecurityPolicy,
  reviewAttachmentDraft,
  validateAttachmentUpload,
  type AttachmentSecurityPolicy,
} from "../domain/attachmentSecurity";

const textExtensions = new Set(["txt", "md", "csv", "json", "log"]);

export async function extractAttachmentDrafts(
  files: File[],
  policy: AttachmentSecurityPolicy = defaultAttachmentSecurityPolicy,
): Promise<AttachmentDraft[]> {
  return Promise.all(files.map((file) => extractAttachmentDraft(file, policy)));
}

async function extractAttachmentDraft(
  file: File,
  policy: AttachmentSecurityPolicy,
): Promise<AttachmentDraft> {
  const validation = validateAttachmentUpload(
    {
      name: file.name,
      mimeType: file.type,
      size: file.size,
    },
    policy,
  );

  if (!validation.allowed) {
    throw new Error(validation.message);
  }

  const extractedText = await extractFileText(file);
  const status: AttachmentExtractionStatus = extractedText.trim()
    ? "extracted"
    : "metadata-only";
  const draft: AttachmentDraft = {
    name: file.name,
    mimeType: file.type,
    size: file.size,
    extractedText,
    summary: summarizeAttachmentText(extractedText),
    status,
    tags: attachmentTagsForFile(file.name, file.type),
  };
  const review = reviewAttachmentDraft(draft, policy, new Date().toISOString());

  if (review.status === "blocked") {
    throw new Error(
      review.reasons[0] ?? "Attachment blocked by security review.",
    );
  }

  if (!review.safeForAi) {
    throw new Error(
      "Attachment requires manual review before it can be used in an AI workshop.",
    );
  }

  return {
    ...draft,
    extractedText: review.safeExtractedText,
    summary: review.safeSummary,
    tags: [
      ...draft.tags,
      `security:${review.status}`,
      ...review.redactions.map((finding) => `redacted:${finding.kind}`),
    ].slice(0, 10),
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
