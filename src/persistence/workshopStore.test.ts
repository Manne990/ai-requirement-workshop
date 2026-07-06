import { describe, expect, it } from "vitest";
import { auditRequirementHistory } from "../domain/audit";
import { createRequirement } from "../domain/requirements";
import { createInitialWorkshopSession } from "../domain/workshop";
import {
  createWorkshopRecord,
  createWorkshopRecordExport,
  parseWorkshopRecordExport,
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
