import { describe, expect, it } from "vitest";
import type { AttachmentDraft } from "./attachments";
import {
  checkAttachmentAccess,
  createAttachmentStorageRef,
  createProductionAttachmentRecord,
  defaultAttachmentSecurityPolicy,
  reviewAttachmentDraft,
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
        checksumSha256: "checksum-1",
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
        objectPath:
          "organizations/org-1/workshops/workshop-1/attachments/attachment-001/requirements.csv",
      },
    });
    expect(record.securityReview.status).toBe("needs-review");
    expect(record.tags).toContain("security:needs-review");
    expect(record.extractedText).toContain("[REDACTED:");
    expect(JSON.stringify(record)).not.toContain(
      "sk-abcdefghijklmnopqrstuvwxyz",
    );
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
