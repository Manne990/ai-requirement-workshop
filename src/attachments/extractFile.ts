import {
  attachmentTagsForFile,
  summarizeAttachmentText,
  type AttachmentDraft,
  type AttachmentExtractionStatus,
} from "../domain/attachments";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import {
  defaultAttachmentSecurityPolicy,
  reviewAttachmentDraft,
  validateAttachmentUpload,
  type AttachmentSecurityPolicy,
} from "../domain/attachmentSecurity";

const textExtensions = new Set(["txt", "md", "csv", "json", "log"]);
const mcdxXmlEntryPattern =
  /^(?:mathcad\/(?:worksheet|result|header|footer)\.xml|docProps\/(?:core|app)\.xml)$/i;
const mcdxXamlPackagePattern = /^mathcad\/xaml\/.*\.XamlPackage$/i;
type PdfTextContentItem = { str?: string };

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

  if (extension === "pdf" || file.type === "application/pdf") {
    return extractPdfText(file);
  }

  if (extension === "mcdx") {
    return extractMcdxText(file);
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

async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = await resolvePdfWorkerUrl();
  const arrayBuffer = await file.arrayBuffer();
  const documentTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
  });
  const document = await documentTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const contentItems = await readPdfTextContentItems(page);
    const text = contentItems
      .map((item) => item.str ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text) {
      pages.push(`# Page ${pageNumber}\n${text}`);
    }
  }

  return pages.join("\n\n").trim();
}

async function readPdfTextContentItems(page: {
  streamTextContent: () => ReadableStream<{ items: PdfTextContentItem[] }>;
}) {
  const reader = page.streamTextContent().getReader();
  const items: PdfTextContentItem[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      items.push(...value.items);
    }
  } finally {
    reader.releaseLock();
  }

  return items;
}

async function resolvePdfWorkerUrl() {
  if (import.meta.env.MODE !== "test") {
    return pdfWorkerUrl;
  }

  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?raw");
  return `data:text/javascript;base64,${base64EncodeUtf8(worker.default)}`;
}

function base64EncodeUtf8(text: string) {
  const bytes = new TextEncoder().encode(text);
  const chunks: string[] = [];
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(index, index + chunkSize)),
    );
  }

  return btoa(chunks.join(""));
}

async function extractMcdxText(file: File) {
  const { unzipSync } = await import("fflate");
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const sections: string[] = [];

  for (const [entryName, bytes] of Object.entries(archive)) {
    if (mcdxXmlEntryPattern.test(entryName)) {
      const text = xmlToPlainText(decodeUtf8(bytes));
      if (text) {
        sections.push(`# ${entryName}\n${text}`);
      }
      continue;
    }

    if (mcdxXamlPackagePattern.test(entryName)) {
      const xamlText = extractXamlPackageText(bytes, unzipSync);
      if (xamlText) {
        sections.push(`# ${entryName}\n${xamlText}`);
      }
    }
  }

  return sections.join("\n\n").trim();
}

function extractXamlPackageText(
  bytes: Uint8Array,
  unzipSync: (data: Uint8Array) => Record<string, Uint8Array>,
) {
  const packageArchive = unzipSync(bytes);
  const parts: string[] = [];

  for (const [entryName, entryBytes] of Object.entries(packageArchive)) {
    if (entryName.toLowerCase().endsWith(".xaml")) {
      const text = xmlToPlainText(decodeUtf8(entryBytes));
      if (text) {
        parts.push(text);
      }
    }
  }

  return parts.join("\n").trim();
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes);
}

function xmlToPlainText(xml: string) {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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
