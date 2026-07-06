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
export type AttachmentStorageStatus =
  "active" | "quarantined" | "metadata-only";

export type AttachmentStorageValidationReason =
  | "missing-object-path"
  | "object-path-scope-mismatch"
  | "missing-checksum"
  | "invalid-checksum"
  | "object-path-not-supported";

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
  status?: AttachmentStorageStatus;
  objectPath?: string;
  checksumSha256?: string;
  storedAt?: string;
};

export type AttachmentStorageValidationDecision =
  | {
      allowed: true;
      expectedObjectPath?: string;
      message: string;
    }
  | {
      allowed: false;
      reason: AttachmentStorageValidationReason;
      expectedObjectPath?: string;
      message: string;
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

const supportedMimeTypesByExtension: Record<string, string[]> = {
  csv: ["application/vnd.ms-excel", "text/csv", "text/plain"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  json: ["application/json", "text/plain"],
  log: ["text/plain"],
  md: ["text/markdown", "text/plain"],
  txt: ["text/plain"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
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
    safeForAi: status === "accepted",
    reasons: reviewReasons(validation, redactions, hasCriticalFinding),
    reviewedAt,
  };
}

export function createProductionAttachmentRecord(
  input: CreateProductionAttachmentRecordInput,
): ProductionAttachmentRecord {
  const organizationId = requiredNonEmpty(
    input.organizationId,
    "organizationId",
  );
  const workshopId = requiredNonEmpty(input.workshopId, "workshopId");
  const attachmentId = requiredNonEmpty(input.id, "attachmentId");
  const sourceMessageId = requiredNonEmpty(
    input.sourceMessageId,
    "sourceMessageId",
  );
  const uploadedByUserId = requiredNonEmpty(
    input.uploadedByUserId,
    "uploadedByUserId",
  );
  const createdAt = requiredNonEmpty(input.createdAt, "createdAt");
  const review = reviewAttachmentDraft(input.draft, input.policy, createdAt);

  if (!review.validation.allowed) {
    throw new Error(review.validation.message);
  }

  if (review.status === "blocked") {
    throw new Error(
      "Attachment blocked by security review. Remove private key material before upload.",
    );
  }

  const name = input.draft.name.trim();
  const storage = normalizeAttachmentStorageRef(
    input.storage ??
      createAttachmentStorageRef({
        provider: "local-browser",
        organizationId,
        workshopId,
        attachmentId,
        fileName: name,
        storedAt: createdAt,
      }),
    {
      organizationId,
      workshopId,
      attachmentId,
      fileName: name,
      scanStatus: review.status,
    },
  );
  const tags = [
    ...attachmentTagsForFile(name, input.draft.mimeType),
    ...input.draft.tags,
    `security:${review.status}`,
    `storage:${storage.status}`,
  ];

  return {
    id: attachmentId,
    name,
    mimeType: input.draft.mimeType,
    size: input.draft.size,
    extractedText: review.safeExtractedText,
    summary: review.safeSummary,
    status: input.draft.status,
    tags: [...new Set(tags)].slice(0, 10),
    sourceMessageId,
    createdAt,
    organizationId,
    workshopId,
    uploadedByUserId,
    provenance: {
      organizationId,
      workshopId,
      attachmentId,
      sourceMessageId,
      uploadedByUserId,
      capturedAt: createdAt,
      originalName: name,
      source: input.source ?? "chat-upload",
    },
    storage,
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
      status: "metadata-only",
      checksumSha256: input.checksumSha256,
      storedAt: input.storedAt,
    };
  }

  const storage: AttachmentStorageRef = {
    provider: input.provider,
    status: "active",
    objectPath: attachmentObjectPath(input),
    checksumSha256: input.checksumSha256,
    storedAt: input.storedAt,
  };
  const validation = validateAttachmentStorageRef({
    storage,
    organizationId: input.organizationId,
    workshopId: input.workshopId,
    attachmentId: input.attachmentId,
    fileName: input.fileName,
  });

  if (!validation.allowed) {
    throw new Error(validation.message);
  }

  return storage;
}

export function validateAttachmentStorageRef(input: {
  storage: AttachmentStorageRef;
  organizationId: string;
  workshopId: string;
  attachmentId: string;
  fileName: string;
}): AttachmentStorageValidationDecision {
  if (input.storage.provider !== "supabase-storage") {
    if (input.storage.objectPath) {
      return {
        allowed: false,
        reason: "object-path-not-supported",
        message:
          "Only provider-backed attachment storage may include an object path.",
      };
    }

    return {
      allowed: true,
      message: "Attachment metadata does not reference provider storage.",
    };
  }

  const expectedObjectPath = attachmentObjectPath(input);

  if (!input.storage.objectPath) {
    return {
      allowed: false,
      reason: "missing-object-path",
      expectedObjectPath,
      message: "Provider-backed attachment storage requires an object path.",
    };
  }

  if (input.storage.objectPath !== expectedObjectPath) {
    return {
      allowed: false,
      reason: "object-path-scope-mismatch",
      expectedObjectPath,
      message:
        "Attachment storage object path must match the organization, workshop, attachment, and file name.",
    };
  }

  if (!input.storage.checksumSha256) {
    return {
      allowed: false,
      reason: "missing-checksum",
      expectedObjectPath,
      message:
        "Provider-backed attachment storage requires a SHA-256 checksum for provenance.",
    };
  }

  if (!/^[a-f0-9]{64}$/i.test(input.storage.checksumSha256)) {
    return {
      allowed: false,
      reason: "invalid-checksum",
      expectedObjectPath,
      message: "Attachment checksum must be a 64-character SHA-256 hex digest.",
    };
  }

  return {
    allowed: true,
    expectedObjectPath,
    message: "Attachment storage object path and checksum are scoped.",
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
    return [
      "Sensitive values were redacted; manual review is required before AI prompt use.",
    ];
  }

  return ["Attachment accepted by local policy review."];
}

function isSupportedAttachmentType(
  extension: string | undefined,
  mimeType: string,
  policy: AttachmentSecurityPolicy,
) {
  if (extension) {
    if (!policy.supportedExtensions.includes(extension)) {
      return false;
    }

    if (!mimeType) {
      return true;
    }

    return (supportedMimeTypesByExtension[extension] ?? []).includes(mimeType);
  }

  return policy.supportedMimeTypes.includes(mimeType);
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
    .replace(/^\.+/, "")
    .slice(0, 120);
  return safe || "unnamed";
}

function attachmentObjectPath(input: {
  organizationId: string;
  workshopId: string;
  attachmentId: string;
  fileName: string;
}) {
  return [
    "organizations",
    safePathSegment(input.organizationId),
    "workshops",
    safePathSegment(input.workshopId),
    "attachments",
    safePathSegment(input.attachmentId),
    safePathSegment(input.fileName),
  ].join("/");
}

function normalizeAttachmentStorageRef(
  storage: AttachmentStorageRef,
  context: {
    organizationId: string;
    workshopId: string;
    attachmentId: string;
    fileName: string;
    scanStatus: AttachmentScanStatus;
  },
): AttachmentStorageRef {
  const validation = validateAttachmentStorageRef({
    storage,
    organizationId: context.organizationId,
    workshopId: context.workshopId,
    attachmentId: context.attachmentId,
    fileName: context.fileName,
  });

  if (!validation.allowed) {
    throw new Error(validation.message);
  }

  if (storage.provider !== "supabase-storage") {
    return {
      provider: storage.provider,
      status: "metadata-only",
      checksumSha256: storage.checksumSha256,
      storedAt: storage.storedAt,
    };
  }

  return {
    provider: storage.provider,
    status: context.scanStatus === "accepted" ? "active" : "quarantined",
    objectPath: storage.objectPath,
    checksumSha256: storage.checksumSha256,
    storedAt: storage.storedAt,
  };
}

function requiredNonEmpty(value: string, fieldName: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`Attachment provenance requires ${fieldName}.`);
  }

  return trimmed;
}
