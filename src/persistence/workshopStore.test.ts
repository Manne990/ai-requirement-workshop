import { describe, expect, it } from "vitest";
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
