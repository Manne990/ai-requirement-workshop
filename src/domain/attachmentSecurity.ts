import {
  attachmentTagsForFile,
  type AttachmentDraft,
  type WorkshopAttachment,
} from "./attachments";
import {
  checkWorkshopAccess,
  type OrganizationAccessDecision,
  type OrganizationPermission,
  type OrganizationScopedWorkshop,
  type OrganizationState,
} from "./organization";
import {
  assessSensitiveText,
  mergeSensitiveFindings,
  type SensitiveFinding,
} from "./security";

export type AttachmentStorageProvider =
  "local-browser" | "supabase-storage" | "imported-export";

export type AttachmentUploadRejectionReason =
  "empty-name" | "empty-file" | "too-large" | "unsupported-type";

export type AttachmentScanStatus = "accepted" | "needs-review" | "blocked";

export type AttachmentUploadMetadata = {
  name: string;
  mimeType: string;
  size: number;
};

export type AttachmentSecurityPolicy = {
  maxFileSizeBytes: number;
  supportedExtensions: string[];
  supportedMimeTypes: string[];
};

export type AttachmentUploadDecision =
  | {
      allowed: true;
      extension?: string;
      message: string;
    }
  | {
      allowed: false;
      reason: AttachmentUploadRejectionReason;
      extension?: string;
      message: string;
    };

export type AttachmentSecurityReview = {
  status: AttachmentScanStatus;
  validation: AttachmentUploadDecision;
  safeExtractedText: string;
  safeSummary: string;
  redactions: SensitiveFinding[];
  safeForAi: boolean;
  reasons: string[];
  reviewedAt?: string;
};

export type AttachmentStorageRef = {
  provider: AttachmentStorageProvider;
  objectPath?: string;
  checksumSha256?: string;
  storedAt?: string;
};

export type AttachmentProvenance = {
  organizationId: string;
  workshopId: string;
  attachmentId: string;
  sourceMessageId: string;
  uploadedByUserId: string;
  capturedAt: string;
  originalName: string;
  source: "chat-upload" | "import";
};

export type ProductionAttachmentRecord = WorkshopAttachment & {
  organizationId: string;
  workshopId: string;
  uploadedByUserId: string;
  provenance: AttachmentProvenance;
  storage: AttachmentStorageRef;
  securityReview: AttachmentSecurityReview;
  retention: {
    policy: "workshop-lifetime" | "manual-delete";
  };
};

export type CreateProductionAttachmentRecordInput = {
  draft: AttachmentDraft;
  id: string;
  organizationId: string;
  workshopId: string;
  sourceMessageId: string;
  uploadedByUserId: string;
  createdAt: string;
  source?: AttachmentProvenance["source"];
  storage?: AttachmentStorageRef;
  policy?: AttachmentSecurityPolicy;
};

export type AttachmentAccessDecision =
  | OrganizationAccessDecision
  | {
      allowed: false;
      reason: "attachment-workshop-mismatch";
    };

export const defaultAttachmentSecurityPolicy: AttachmentSecurityPolicy = {
  maxFileSizeBytes: 10 * 1024 * 1024,
  supportedExtensions: [
    "csv",
    "docx",
    "json",
    "log",
    "md",
    "txt",
    "xls",
    "xlsx",
  ],
  supportedMimeTypes: [
    "application/json",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/csv",
    "text/markdown",
    "text/plain",
  ],
};

export function validateAttachmentUpload(
  metadata: AttachmentUploadMetadata,
  policy: AttachmentSecurityPolicy = defaultAttachmentSecurityPolicy,
): AttachmentUploadDecision {
  const name = metadata.name.trim();
  const extension = extensionForName(name);
  const normalizedMimeType = metadata.mimeType.trim().toLowerCase();

  if (!name) {
    return {
      allowed: false,
      reason: "empty-name",
      message: "Attachment must have a file name.",
    };
  }

  if (metadata.size <= 0) {
    return {
      allowed: false,
      reason: "empty-file",
      extension,
      message: "Attachment is empty.",
    };
  }

  if (metadata.size > policy.maxFileSizeBytes) {
    return {
      allowed: false,
      reason: "too-large",
      extension,
      message: `Attachment exceeds the ${formatBytes(policy.maxFileSizeBytes)} size limit.`,
    };
  }

  if (!isSupportedAttachmentType(extension, normalizedMimeType, policy)) {
    return {
      allowed: false,
      reason: "unsupported-type",
      extension,
      message:
        "Unsupported attachment type. Upload CSV, TXT, Markdown, JSON, DOCX, XLS, or XLSX files.",
    };
  }

  return {
    allowed: true,
    extension,
    message: "Attachment type and size are supported.",
  };
}

export function reviewAttachmentDraft(
  draft: AttachmentDraft,
  policy: AttachmentSecurityPolicy = defaultAttachmentSecurityPolicy,
  reviewedAt?: string,
): AttachmentSecurityReview {
  const validation = validateAttachmentUpload(draft, policy);
  const extractedText = assessSensitiveText(draft.extractedText);
  const summary = assessSensitiveText(draft.summary);
  const redactions = mergeSensitiveFindings([
    ...extractedText.findings,
    ...summary.findings,
  ]);
  const hasCriticalFinding = redactions.some(
    (finding) => finding.severity === "critical",
  );
  const status: AttachmentScanStatus = !validation.allowed
    ? "blocked"
    : hasCriticalFinding
      ? "blocked"
      : redactions.length > 0
        ? "needs-review"
        : "accepted";

  return {
    status,
    validation,
    safeExtractedText: status === "blocked" ? "" : extractedText.redactedText,
    safeSummary: status === "blocked" ? "" : summary.redactedText,
    redactions,
    safeForAi: status !== "blocked",
    reasons: reviewReasons(validation, redactions, hasCriticalFinding),
    reviewedAt,
  };
}

export function createProductionAttachmentRecord(
  input: CreateProductionAttachmentRecordInput,
): ProductionAttachmentRecord {
  const review = reviewAttachmentDraft(
    input.draft,
    input.policy,
    input.createdAt,
  );

  if (!review.validation.allowed) {
    throw new Error(review.validation.message);
  }

  if (review.status === "blocked") {
    throw new Error(
      "Attachment blocked by security review. Remove private key material before upload.",
    );
  }

  const tags = [
    ...attachmentTagsForFile(input.draft.name, input.draft.mimeType),
    ...input.draft.tags,
    `security:${review.status}`,
  ];

  return {
    id: input.id,
    name: input.draft.name.trim(),
    mimeType: input.draft.mimeType,
    size: input.draft.size,
    extractedText: review.safeExtractedText,
    summary: review.safeSummary,
    status: input.draft.status,
    tags: [...new Set(tags)].slice(0, 10),
    sourceMessageId: input.sourceMessageId,
    createdAt: input.createdAt,
    organizationId: input.organizationId,
    workshopId: input.workshopId,
    uploadedByUserId: input.uploadedByUserId,
    provenance: {
      organizationId: input.organizationId,
      workshopId: input.workshopId,
      attachmentId: input.id,
      sourceMessageId: input.sourceMessageId,
      uploadedByUserId: input.uploadedByUserId,
      capturedAt: input.createdAt,
      originalName: input.draft.name,
      source: input.source ?? "chat-upload",
    },
    storage:
      input.storage ??
      createAttachmentStorageRef({
        provider: "local-browser",
        organizationId: input.organizationId,
        workshopId: input.workshopId,
        attachmentId: input.id,
        fileName: input.draft.name,
        storedAt: input.createdAt,
      }),
    securityReview: review,
    retention: {
      policy: "workshop-lifetime",
    },
  };
}

export function createAttachmentStorageRef(input: {
  provider: AttachmentStorageProvider;
  organizationId: string;
  workshopId: string;
  attachmentId: string;
  fileName: string;
  checksumSha256?: string;
  storedAt?: string;
}): AttachmentStorageRef {
  if (input.provider !== "supabase-storage") {
    return {
      provider: input.provider,
      checksumSha256: input.checksumSha256,
      storedAt: input.storedAt,
    };
  }

  return {
    provider: input.provider,
    objectPath: [
      "organizations",
      safePathSegment(input.organizationId),
      "workshops",
      safePathSegment(input.workshopId),
      "attachments",
      safePathSegment(input.attachmentId),
      safePathSegment(input.fileName),
    ].join("/"),
    checksumSha256: input.checksumSha256,
    storedAt: input.storedAt,
  };
}

export function checkAttachmentAccess(
  state: OrganizationState,
  userId: string,
  attachment: Pick<ProductionAttachmentRecord, "organizationId" | "workshopId">,
  workshop: OrganizationScopedWorkshop,
  permission: OrganizationPermission = "view-workshop",
): AttachmentAccessDecision {
  if (
    attachment.organizationId !== workshop.organizationId ||
    attachment.workshopId !== workshop.id
  ) {
    return {
      allowed: false,
      reason: "attachment-workshop-mismatch",
    };
  }

  return checkWorkshopAccess(state, userId, workshop, permission);
}

function reviewReasons(
  validation: AttachmentUploadDecision,
  redactions: SensitiveFinding[],
  hasCriticalFinding: boolean,
) {
  if (!validation.allowed) {
    return [validation.message];
  }

  if (hasCriticalFinding) {
    return ["Private key material blocks attachment intake."];
  }

  if (redactions.length > 0) {
    return ["Sensitive values were redacted before storage and AI prompt use."];
  }

  return ["Attachment accepted by local policy review."];
}

function isSupportedAttachmentType(
  extension: string | undefined,
  mimeType: string,
  policy: AttachmentSecurityPolicy,
) {
  return (
    (extension !== undefined &&
      policy.supportedExtensions.includes(extension)) ||
    policy.supportedMimeTypes.includes(mimeType) ||
    mimeType.startsWith("text/")
  );
}

function extensionForName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  return extension && extension !== name.toLowerCase() ? extension : undefined;
}

function formatBytes(bytes: number) {
  const mib = bytes / (1024 * 1024);
  return `${Number.isInteger(mib) ? mib : mib.toFixed(1)} MiB`;
}

function safePathSegment(value: string) {
  const safe = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
  return safe || "unnamed";
}
