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
    const record = createWorkshopRecord(session, {
      "agent-quality": ["artifact-1"],
    });

    const parsed = parseWorkshopRecordExport(
      JSON.stringify(createWorkshopRecordExport(record)),
    );

    expect(parsed.id).toBe("workshop-export-test");
    expect(parsed.session.id).toBe("workshop-export-test");
    expect(parsed.seenInsightIdsByParticipant["agent-quality"]).toEqual([
      "artifact-1",
    ]);
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
});
