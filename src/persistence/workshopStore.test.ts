import { describe, expect, it } from "vitest";
import { auditRequirementHistory } from "../domain/audit";
import { approveRequirement, createRequirement } from "../domain/requirements";
import {
  createInitialWorkshopSession,
  type WorkshopSession,
} from "../domain/workshop";
import {
  createWorkshopRecord,
  createWorkshopRecordExport,
  parseWorkshopRecordExport,
  sanitizeImportedWorkshopRecord,
} from "./workshopStore";

describe("workshopStore export format", () => {
  it("round-trips a complete workshop record export", () => {
    const session = createInitialWorkshopSession(
      "2026-07-06T08:00:00.000Z",
      "workshop-export-test",
    );
    const record = createWorkshopRecord(
      session,
      {
        "agent-quality": ["artifact-1"],
      },
      {
        organizationId: "organization-001",
      },
    );

    const exported = createWorkshopRecordExport(
      record,
      "2026-07-06T08:05:00.000Z",
    );
    const parsed = parseWorkshopRecordExport(JSON.stringify(exported));

    expect(parsed.id).toBe("workshop-export-test");
    expect(parsed.organizationId).toBe("organization-001");
    expect(parsed.session.id).toBe("workshop-export-test");
    expect(parsed.seenInsightIdsByParticipant["agent-quality"]).toEqual([
      "artifact-1",
    ]);
    expect(exported.provenance).toEqual({
      source: "workshop-store",
      generator: "createWorkshopRecordExport",
      exportedAt: "2026-07-06T08:05:00.000Z",
      workshopId: "workshop-export-test",
      workshopUpdatedAt: "2026-07-06T08:00:00.000Z",
      counts: {
        messages: 1,
        artifacts: 0,
        attachments: 0,
        prototypes: 0,
        prototypeVersions: 0,
      },
    });
  });

  it("rejects imports without workshop session state", () => {
    expect(() =>
      parseWorkshopRecordExport(JSON.stringify({ id: "broken" })),
    ).toThrow(/missing session/i);
  });

  it("redacts sensitive user-controlled text in full record exports", () => {
    const session = {
      ...createInitialWorkshopSession(
        "2026-07-06T08:00:00.000Z",
        "workshop-export-redaction",
      ),
      messages: [
        ...createInitialWorkshopSession(
          "2026-07-06T08:00:00.000Z",
          "workshop-export-redaction",
        ).messages,
        {
          id: "message-secret",
          participantId: "human-1",
          kind: "human-input" as const,
          body: "Use password=hunter2 during the migration.",
          relatedArtifactIds: [],
          createdAt: "2026-07-06T08:01:00.000Z",
        },
      ],
      attachments: [
        {
          id: "attachment-secret",
          name: "secrets.txt",
          mimeType: "text/plain",
          size: 64,
          extractedText: "Bearer abcdefghijklmnopqrstuvwxyz",
          summary: "Contact ops@example.com with token=supersecret.",
          status: "extracted" as const,
          tags: ["api_key=sk-abcdefghijklmnopqrstuvwxyz123456"],
          sourceMessageId: "message-secret",
          createdAt: "2026-07-06T08:01:00.000Z",
        },
      ],
    };
    const record = createWorkshopRecord(session);
    const exported = createWorkshopRecordExport(
      record,
      "2026-07-06T08:05:00.000Z",
    );
    const serialized = JSON.stringify(exported);
    const parsed = parseWorkshopRecordExport(serialized);

    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(serialized).not.toContain("supersecret");
    expect(serialized).not.toContain("ops@example.com");
    expect(serialized).toContain("[REDACTED:");
    expect(parsed.id).toBe("workshop-export-redaction");
    expect(parsed.session.attachments[0]?.summary).toContain("[REDACTED:");
  });

  it("round-trips persisted requirement ledger and audit events", () => {
    const session = createInitialWorkshopSession(
      "2026-07-06T08:00:00.000Z",
      "workshop-ledger-export",
    );
    const requirement = createRequirement({
      id: "requirement-1",
      title: "Alarm dashboard",
      statement: "The dashboard should show active alarms.",
      state: "candidate",
      createdAt: "2026-07-06T08:01:00.000Z",
      createdBy: "agent-quality",
      sourceRefs: [{ messageId: "message-1", participantId: "human-1" }],
      rationale: "Derived from workshop discussion.",
    });
    const auditEvents = auditRequirementHistory(requirement, {
      organizationId: "organization-001",
      workshopId: session.id,
    });
    const record = createWorkshopRecord(
      session,
      {},
      {
        organizationId: "organization-001",
        requirements: [requirement],
        auditEvents,
      },
    );
    const parsed = parseWorkshopRecordExport(
      JSON.stringify(
        createWorkshopRecordExport(record, "2026-07-06T08:05:00.000Z"),
      ),
    );

    expect(parsed.requirements).toEqual([requirement]);
    expect(parsed.auditEvents).toEqual(auditEvents);
  });

  it("sanitizes imported exports as untrusted recovery state", () => {
    const session = {
      ...createInitialWorkshopSession(
        "2026-07-06T08:00:00.000Z",
        "workshop-import-sanitized",
      ),
      artifacts: [
        {
          id: "artifact-requirement-1",
          type: "requirement" as const,
          title: "Imported approved requirement",
          content: "This requirement was approved in another file.",
          status: "accepted" as const,
          createdBy: "agent-quality",
          updatedAt: "2026-07-06T08:01:00.000Z",
          source: {
            messageId: "message-1",
            participantId: "human-1",
          },
          tags: ["requirement", "accepted"],
        },
      ],
      attachments: [
        {
          id: "attachment-forged",
          name: "requirements.csv",
          mimeType: "text/csv",
          size: 64,
          extractedText: "User story, acceptance criteria",
          summary: "Imported requirements.",
          status: "extracted" as const,
          tags: ["attachment", "security:accepted", "storage:active"],
          sourceMessageId: "message-1",
          createdAt: "2026-07-06T08:01:00.000Z",
          storage: {
            provider: "supabase-storage",
            status: "active",
            objectPath:
              "organizations/other/workshops/other/attachments/attachment-forged/requirements.csv",
            checksumSha256: "a".repeat(64),
          },
          securityReview: {
            status: "accepted",
          },
        },
      ],
      prototypes: [{}] as unknown as WorkshopSession["prototypes"],
    };
    const requirement = approveRequirement(
      createRequirement({
        id: "requirement-1",
        title: "Imported approved requirement",
        statement: "This requirement was approved in another file.",
        state: "candidate",
        createdAt: "2026-07-06T08:01:00.000Z",
        createdBy: "agent-quality",
        sourceRefs: [
          { artifactId: "artifact-requirement-1", participantId: "human-1" },
        ],
        acceptanceCriteria: [
          {
            id: "criterion-1",
            text: "The owner can verify the imported requirement.",
          },
        ],
        rationale: "Forged import evidence.",
      }),
      {
        actorId: "human-1",
        at: "2026-07-06T08:02:00.000Z",
        rationale: "Forged approval evidence.",
      },
    );
    const record = createWorkshopRecord(
      session,
      {},
      {
        organizationId: "foreign-org",
        requirements: [requirement],
        auditEvents: auditRequirementHistory(requirement, {
          organizationId: "foreign-org",
          workshopId: session.id,
        }),
      },
    );

    const sanitized = sanitizeImportedWorkshopRecord(record, {
      organizationId: "organization-001",
      importedByUserId: "auth-user:owner@example.com",
      importedAt: "2026-07-06T09:00:00.000Z",
    });

    expect(sanitized.organizationId).toBe("organization-001");
    expect(sanitized.requirements).toEqual([]);
    expect(sanitized.auditEvents).toEqual([]);
    expect(sanitized.seenInsightIdsByParticipant).toEqual({});
    expect(sanitized.session.prototypes).toEqual([]);
    expect(sanitized.session.artifacts[0]).toMatchObject({
      status: "draft",
      tags: expect.arrayContaining([
        "imported-export",
        "requires-local-review",
      ]),
    });
    expect(sanitized.session.artifacts[0]?.tags).not.toContain("accepted");
    expect(sanitized.session.attachments[0]).toMatchObject({
      id: "attachment-forged",
      organizationId: "organization-001",
      workshopId: "workshop-import-sanitized",
      uploadedByUserId: "auth-user:owner@example.com",
      provenance: {
        source: "import",
        originalName: "requirements.csv",
      },
      storage: {
        provider: "imported-export",
        status: "metadata-only",
      },
      securityReview: {
        status: "accepted",
      },
    });
    expect(sanitized.session.attachments[0]).not.toHaveProperty(
      "storage.objectPath",
    );
  });

  it("normalizes legacy imports that do not have prototypes yet", () => {
    const session = createInitialWorkshopSession(
      "2026-07-06T08:00:00.000Z",
      "legacy-workshop",
    );
    const { prototypes: _prototypes, ...legacySession } = session;

    const parsed = parseWorkshopRecordExport(
      JSON.stringify({
        id: "legacy-workshop",
        title: "Legacy workshop",
        createdAt: "2026-07-06T08:00:00.000Z",
        updatedAt: "2026-07-06T08:00:00.000Z",
        session: legacySession,
      }),
    );

    expect(parsed.session.prototypes).toEqual([]);
  });

  it("imports legacy export envelopes without provenance metadata", () => {
    const session = createInitialWorkshopSession(
      "2026-07-06T08:00:00.000Z",
      "legacy-envelope",
    );
    const record = createWorkshopRecord(session);

    const parsed = parseWorkshopRecordExport(
      JSON.stringify({
        schema_version: 1,
        kind: "AI_REQUIREMENT_WORKSHOP_RECORD_EXPORT",
        exportedAt: "2026-07-06T08:05:00.000Z",
        record,
      }),
    );

    expect(parsed.id).toBe("legacy-envelope");
    expect(parsed.session.prototypes).toEqual([]);
  });
});
