export type AttachmentExtractionStatus = "extracted" | "metadata-only";

export type AttachmentDraft = {
  name: string;
  mimeType: string;
  size: number;
  extractedText: string;
  summary: string;
  status: AttachmentExtractionStatus;
  tags: string[];
};

export type WorkshopAttachment = AttachmentDraft & {
  id: string;
  createdAt: string;
  sourceMessageId: string;
};

export function summarizeAttachmentText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "No extractable text was found in this file.";
  }

  return normalized.length > 360
    ? `${normalized.slice(0, 357)}...`
    : normalized;
}

export function attachmentTagsForFile(name: string, mimeType: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  return [
    "attachment",
    extension ? `file:${extension}` : undefined,
    mimeType ? `mime:${mimeType}` : undefined,
  ].filter((tag): tag is string => Boolean(tag));
}
