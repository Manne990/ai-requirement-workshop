import { describe, expect, it } from "vitest";
import type { AttachmentDraft } from "./attachments";
import {
  checkAttachmentAccess,
  createAttachmentStorageRef,
  createProductionAttachmentRecord,
  defaultAttachmentSecurityPolicy,
  reviewAttachmentDraft,
  validateAttachmentStorageRef,
  validateAttachmentUpload,
} from "./attachmentSecurity";
import { createOrganization, emptyOrganizationState } from "./organization";

const createdAt = "2026-07-06T09:00:00.000Z";

describe("attachment security domain", () => {
  it("rejects unsupported and oversized uploads with clear policy messages", () => {
    const oversized = validateAttachmentUpload({
      name: "large-requirements.csv",
      mimeType: "text/csv",
      size: defaultAttachmentSecurityPolicy.maxFileSizeBytes + 1,
    });
    const unsupported = validateAttachmentUpload({
      name: "installer.exe",
      mimeType: "application/x-msdownload",
      size: 128,
    });

    expect(oversized).toMatchObject({
      allowed: false,
      reason: "too-large",
    });
    expect(oversized.message).toContain("10 MiB");
    expect(unsupported).toMatchObject({
      allowed: false,
      reason: "unsupported-type",
    });
    expect(unsupported.message).toContain("Unsupported attachment type");
  });

  it("rejects supported MIME types when the file extension is unsafe", () => {
    const executableWithTextMime = validateAttachmentUpload({
      name: "installer.exe",
      mimeType: "text/plain",
      size: 128,
    });
    const spreadsheetWithExecutableMime = validateAttachmentUpload({
      name: "requirements.xlsx",
      mimeType: "application/x-msdownload",
      size: 128,
    });

    expect(executableWithTextMime).toMatchObject({
      allowed: false,
      reason: "unsupported-type",
    });
    expect(spreadsheetWithExecutableMime).toMatchObject({
      allowed: false,
      reason: "unsupported-type",
    });
  });

  it("creates scoped production attachment metadata with provenance, storage, and redacted text", () => {
    const record = createProductionAttachmentRecord({
      draft: {
        ...sourceDraft,
        extractedText:
          "owner_email=ops@example.com api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
        summary:
          "ops@example.com owns api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
      },
      id: "attachment-001",
      organizationId: "org-1",
      workshopId: "workshop-1",
      sourceMessageId: "message-1",
      uploadedByUserId: "user-owner",
      createdAt,
      storage: createAttachmentStorageRef({
        provider: "supabase-storage",
        organizationId: "org-1",
        workshopId: "workshop-1",
        attachmentId: "attachment-001",
        fileName: "requirements.csv",
        checksumSha256:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        storedAt: createdAt,
      }),
    });

    expect(record).toMatchObject({
      organizationId: "org-1",
      workshopId: "workshop-1",
      sourceMessageId: "message-1",
      uploadedByUserId: "user-owner",
      provenance: {
        attachmentId: "attachment-001",
        sourceMessageId: "message-1",
        originalName: "requirements.csv",
      },
      storage: {
        provider: "supabase-storage",
        status: "quarantined",
        objectPath:
          "organizations/org-1/workshops/workshop-1/attachments/attachment-001/requirements.csv",
      },
    });
    expect(record.securityReview.status).toBe("needs-review");
    expect(record.securityReview.safeForAi).toBe(false);
    expect(record.tags).toContain("security:needs-review");
    expect(record.tags).toContain("storage:quarantined");
    expect(record.extractedText).toContain("[REDACTED:");
    expect(JSON.stringify(record)).not.toContain(
      "sk-abcdefghijklmnopqrstuvwxyz",
    );
  });

  it("marks clean provider-backed attachments active after scan acceptance", () => {
    const record = createProductionAttachmentRecord({
      draft: sourceDraft,
      id: "attachment-001",
      organizationId: "org-1",
      workshopId: "workshop-1",
      sourceMessageId: "message-1",
      uploadedByUserId: "user-owner",
      createdAt,
      storage: createAttachmentStorageRef({
        provider: "supabase-storage",
        organizationId: "org-1",
        workshopId: "workshop-1",
        attachmentId: "attachment-001",
        fileName: "requirements.csv",
        checksumSha256:
          "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        storedAt: createdAt,
      }),
    });

    expect(record.securityReview.status).toBe("accepted");
    expect(record.securityReview.safeForAi).toBe(true);
    expect(record.storage.status).toBe("active");
    expect(record.tags).toContain("storage:active");
  });

  it("blocks private key material before attachment intake", () => {
    const review = reviewAttachmentDraft({
      ...sourceDraft,
      extractedText:
        "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
      summary: "private key",
    });

    expect(review.status).toBe("blocked");
    expect(review.safeForAi).toBe(false);
    expect(review.reasons).toEqual([
      "Private key material blocks attachment intake.",
    ]);
    expect(() =>
      createProductionAttachmentRecord({
        draft: {
          ...sourceDraft,
          extractedText:
            "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
        },
        id: "attachment-001",
        organizationId: "org-1",
        workshopId: "workshop-1",
        sourceMessageId: "message-1",
        uploadedByUserId: "user-owner",
        createdAt,
      }),
    ).toThrow("Attachment blocked by security review");
  });

  it("requires provider storage to match scoped object path and checksum", () => {
    const expectedObjectPath =
      "organizations/org-1/workshops/workshop-1/attachments/attachment-001/requirements.csv";

    expect(
      validateAttachmentStorageRef({
        storage: {
          provider: "supabase-storage",
          status: "active",
          objectPath:
            "organizations/org-2/workshops/workshop-1/attachments/attachment-001/requirements.csv",
          checksumSha256:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
        organizationId: "org-1",
        workshopId: "workshop-1",
        attachmentId: "attachment-001",
        fileName: "requirements.csv",
      }),
    ).toMatchObject({
      allowed: false,
      reason: "object-path-scope-mismatch",
      expectedObjectPath,
    });
    expect(
      validateAttachmentStorageRef({
        storage: {
          provider: "supabase-storage",
          status: "active",
          objectPath: expectedObjectPath,
        },
        organizationId: "org-1",
        workshopId: "workshop-1",
        attachmentId: "attachment-001",
        fileName: "requirements.csv",
      }),
    ).toMatchObject({
      allowed: false,
      reason: "missing-checksum",
      expectedObjectPath,
    });
    expect(() =>
      createAttachmentStorageRef({
        provider: "supabase-storage",
        organizationId: "org-1",
        workshopId: "workshop-1",
        attachmentId: "attachment-001",
        fileName: "requirements.csv",
      }),
    ).toThrow("Provider-backed attachment storage requires a SHA-256 checksum");
    expect(() =>
      createProductionAttachmentRecord({
        draft: sourceDraft,
        id: "attachment-001",
        organizationId: "org-1",
        workshopId: "workshop-1",
        sourceMessageId: "message-1",
        uploadedByUserId: "user-owner",
        createdAt,
        storage: {
          provider: "supabase-storage",
          status: "active",
          objectPath:
            "organizations/org-2/workshops/workshop-1/attachments/attachment-001/requirements.csv",
          checksumSha256:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      }),
    ).toThrow("Attachment storage object path must match");
  });

  it("normalizes provider object path segments instead of trusting raw names", () => {
    const storage = createAttachmentStorageRef({
      provider: "supabase-storage",
      organizationId: "org/../1",
      workshopId: "workshop 1",
      attachmentId: "../attachment-001",
      fileName: "../exports/requirements.csv",
      checksumSha256:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      storedAt: createdAt,
    });

    expect(storage.objectPath).toBe(
      "organizations/org_.._1/workshops/workshop_1/attachments/_attachment-001/_exports_requirements.csv",
    );
    expect(storage.objectPath).not.toContain("../");
    expect(
      validateAttachmentStorageRef({
        storage,
        organizationId: "org/../1",
        workshopId: "workshop 1",
        attachmentId: "../attachment-001",
        fileName: "../exports/requirements.csv",
      }),
    ).toMatchObject({
      allowed: true,
    });
  });

  it("keeps imported attachments as metadata-only provenance without provider object paths", () => {
    const record = createProductionAttachmentRecord({
      draft: {
        ...sourceDraft,
        name: " requirements.csv ",
      },
      id: "attachment-001",
      organizationId: "org-1",
      workshopId: "workshop-1",
      sourceMessageId: "message-1",
      uploadedByUserId: "user-owner",
      createdAt,
      source: "import",
      storage: createAttachmentStorageRef({
        provider: "imported-export",
        organizationId: "org-1",
        workshopId: "workshop-1",
        attachmentId: "attachment-001",
        fileName: "requirements.csv",
        storedAt: createdAt,
      }),
    });

    expect(record.name).toBe("requirements.csv");
    expect(record.provenance).toMatchObject({
      source: "import",
      originalName: "requirements.csv",
    });
    expect(record.storage).toMatchObject({
      provider: "imported-export",
      status: "metadata-only",
    });
    expect(record.storage.objectPath).toBeUndefined();
    expect(record.tags).toContain("storage:metadata-only");
    expect(() =>
      createProductionAttachmentRecord({
        draft: sourceDraft,
        id: "attachment-001",
        organizationId: "org-1",
        workshopId: "workshop-1",
        sourceMessageId: " ",
        uploadedByUserId: "user-owner",
        createdAt,
      }),
    ).toThrow("Attachment provenance requires sourceMessageId.");
  });

  it("checks attachment access through active organization workshop membership", () => {
    const state = createOrganization(
      createOrganization(
        emptyOrganizationState,
        {
          id: "org-1",
          name: "Operations",
          ownerUserId: "user-owner",
        },
        createdAt,
      ),
      {
        id: "org-2",
        name: "Other tenant",
        ownerUserId: "user-other",
      },
      createdAt,
    );
    const attachment = createProductionAttachmentRecord({
      draft: sourceDraft,
      id: "attachment-001",
      organizationId: "org-1",
      workshopId: "workshop-1",
      sourceMessageId: "message-1",
      uploadedByUserId: "user-owner",
      createdAt,
    });
    const workshop = {
      id: "workshop-1",
      organizationId: "org-1",
    };

    expect(
      checkAttachmentAccess(state, "user-owner", attachment, workshop),
    ).toMatchObject({
      allowed: true,
      reason: "allowed",
    });
    expect(
      checkAttachmentAccess(state, "user-other", attachment, workshop),
    ).toMatchObject({
      allowed: false,
      reason: "membership-missing",
    });
    expect(
      checkAttachmentAccess(
        state,
        "user-owner",
        {
          organizationId: "org-2",
          workshopId: "workshop-2",
        },
        workshop,
      ),
    ).toMatchObject({
      allowed: false,
      reason: "attachment-workshop-mismatch",
    });
  });
});

const sourceDraft: AttachmentDraft = {
  name: "requirements.csv",
  mimeType: "text/csv",
  size: 128,
  extractedText: "id,title\n1,Alarm dashboard",
  summary: "id,title 1,Alarm dashboard",
  status: "extracted",
  tags: ["attachment", "file:csv"],
};
