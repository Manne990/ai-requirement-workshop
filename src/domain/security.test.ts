import { describe, expect, it } from "vitest";
import {
  aiProcessingDisclosure,
  buildSafeAiWorkshopPayload,
  redactSensitiveText,
} from "./security";
import { createOrganization, emptyOrganizationState } from "./organization";
import { createInitialWorkshopSession, participantIds } from "./workshop";

describe("security and AI prompt boundaries", () => {
  it("redacts sensitive message, artifact, and attachment data before AI payload construction", () => {
    const session = createInitialWorkshopSession("2026-07-06T09:00:00.000Z");
    const scopedSession = {
      ...session,
      messages: [
        ...session.messages,
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `message-${index + 1}`,
          participantId: participantIds.human,
          kind: "human-input" as const,
          body:
            index === 9
              ? "Reach ops@example.com and use password=hunter2."
              : `Message ${index + 1}`,
          createdAt: "2026-07-06T09:01:00.000Z",
          relatedArtifactIds: [],
        })),
      ],
      artifacts: Array.from({ length: 26 }, (_, index) => ({
        id: `artifact-requirement-${index + 1}`,
        type: "requirement" as const,
        title: `Requirement ${index + 1}`,
        content:
          index === 25
            ? "The API key is sk-abcdefghijklmnopqrstuvwxyz123456."
            : `Requirement content ${index + 1}`,
        status: "draft" as const,
        createdBy: participantIds.quality,
        updatedAt: "2026-07-06T09:01:00.000Z",
        source: {
          messageId: "message-1",
          participantId: participantIds.human,
        },
        tags: ["candidate"],
      })),
      attachments: [
        {
          id: "attachment-001",
          name: "contacts.csv",
          mimeType: "text/csv",
          size: 100,
          extractedText: "ops@example.com",
          summary: "ops@example.com",
          status: "extracted" as const,
          tags: ["attachment"],
          sourceMessageId: "message-1",
          createdAt: "2026-07-06T09:01:00.000Z",
        },
      ],
    };

    const boundary = buildSafeAiWorkshopPayload({
      session: scopedSession,
      message: "User 19800101-1234 says token=supersecret.",
      attachments: [
        {
          name: "secrets.csv",
          mimeType: "text/csv",
          size: 64,
          extractedText:
            "api_key=sk-abcdefghijklmnopqrstuvwxyz123456 extra context that should be truncated",
          summary: "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
          status: "extracted",
          tags: ["attachment", "file:csv"],
        },
      ],
      maxAttachmentTextLength: 48,
    });
    const payloadJson = JSON.stringify(boundary.payload);

    expect(boundary.payload.session.recentMessages).toHaveLength(8);
    expect(boundary.payload.session.artifacts).toHaveLength(24);
    expect(
      boundary.payload.attachments[0]?.extractedText.length,
    ).toBeLessThanOrEqual(48);
    expect(boundary.payload.privacyDisclosure).toBe(aiProcessingDisclosure);
    expect(boundary.redactions.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining([
        "credential-assignment",
        "email-address",
        "openai-api-key",
        "swedish-personal-number",
      ]),
    );
    expect(payloadJson).not.toContain("hunter2");
    expect(payloadJson).not.toContain("19800101-1234");
    expect(payloadJson).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(payloadJson).toContain("[REDACTED:");
  });

  it("requires active organization access before building scoped AI prompts", () => {
    const organizationState = createOrganization(
      emptyOrganizationState,
      {
        id: "org-1",
        name: "Operations",
        ownerUserId: "user-owner",
      },
      "2026-07-06T09:00:00.000Z",
    );
    const workshop = {
      id: "workshop-1",
      organizationId: "org-1",
    };

    expect(
      buildSafeAiWorkshopPayload({
        organizationState,
        actorUserId: "user-owner",
        workshop,
        session: createInitialWorkshopSession("2026-07-06T09:00:00.000Z"),
        message: "Continue the workshop.",
      }).accessDecision,
    ).toMatchObject({
      allowed: true,
      reason: "allowed",
    });
    expect(() =>
      buildSafeAiWorkshopPayload({
        organizationState,
        actorUserId: "user-outsider",
        workshop,
        session: createInitialWorkshopSession("2026-07-06T09:00:00.000Z"),
        message: "Continue the workshop.",
      }),
    ).toThrow("AI prompt construction denied: membership-missing.");
  });

  it("exposes a reusable redaction helper for exports and backend boundaries", () => {
    expect(
      redactSensitiveText(
        [
          "Bearer abcdefghijklmnopqrstuvwxyz",
          "SUPABASE_SERVICE_ROLE_KEY=server-only-secret",
          "198001011234",
        ].join("\n"),
      ),
    ).toBe(
      [
        "[REDACTED:bearer-token]",
        "[REDACTED:credential]",
        "[REDACTED:personal-id]",
      ].join("\n"),
    );
  });

  it("redacts user-controlled tags and caps new attachment payloads", () => {
    const session = {
      ...createInitialWorkshopSession("2026-07-06T09:00:00.000Z"),
      artifacts: [
        {
          id: "artifact-1",
          type: "source" as const,
          title: "Source",
          content: "Clean content",
          status: "draft" as const,
          createdBy: participantIds.facilitator,
          updatedAt: "2026-07-06T09:01:00.000Z",
          source: {
            messageId: "message-1",
            participantId: participantIds.human,
          },
          tags: [
            "requirement",
            "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
            "tag-2",
            "tag-3",
            "tag-4",
            "tag-5",
            "tag-6",
            "tag-7",
            "tag-8",
          ],
        },
      ],
      attachments: [
        {
          id: "attachment-existing",
          name: "existing.txt",
          mimeType: "text/plain",
          size: 64,
          extractedText: "Not included from session attachments",
          summary: "Summary",
          status: "extracted" as const,
          tags: ["owner=ops@example.com"],
          sourceMessageId: "message-1",
          createdAt: "2026-07-06T09:01:00.000Z",
        },
      ],
    };

    const boundary = buildSafeAiWorkshopPayload({
      session,
      message: "Review attached sources.",
      attachments: Array.from({ length: 13 }, (_, index) => ({
        name: `source-${index}.txt`,
        mimeType: "text/plain",
        size: 64,
        extractedText: `Attachment ${index}`,
        summary: `Summary ${index}`,
        status: "extracted" as const,
        tags:
          index === 0
            ? ["Bearer abcdefghijklmnopqrstuvwxyz", "safe"]
            : ["safe"],
      })),
    });
    const payloadJson = JSON.stringify(boundary.payload);

    expect(boundary.payload.attachments).toHaveLength(12);
    expect(boundary.payload.session.artifacts[0]?.tags).toHaveLength(8);
    expect(boundary.redactions.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining([
        "bearer-token",
        "credential-assignment",
        "email-address",
      ]),
    );
    expect(payloadJson).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(payloadJson).not.toContain("ops@example.com");
    expect(payloadJson).not.toContain("Bearer abcdefghijklmnopqrstuvwxyz");
    expect(payloadJson).toContain("[REDACTED:");
  });
});
