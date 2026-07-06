import { describe, expect, it } from "vitest";
import {
  applyArtifactConsolidationSuggestion,
  mergeArtifactsIntoRequirement,
  splitArtifactIntoRequirements,
  suggestArtifactConsolidations,
} from "./artifactConsolidation";
import {
  createInitialWorkshopSession,
  participantIds,
  type ArtifactType,
  type WorkshopArtifact,
  type WorkshopSession,
} from "./workshop";

const createdAt = "2026-07-01T10:00:00.000Z";
const updatedAt = "2026-07-01T10:05:00.000Z";

describe("artifact consolidation", () => {
  it("suggests pending merge candidates without applying them", () => {
    const first = draftArtifact({
      id: "artifact-requirement-1",
      title: "Alarm overview",
      content: "Dashboard should show active customer alarms.",
    });
    const second = draftArtifact({
      id: "artifact-requirement-2",
      title: "Active alarm dashboard",
      content:
        "The alarm dashboard must display active alarms for each customer.",
    });
    const unrelated = draftArtifact({
      id: "artifact-risk-3",
      type: "risk",
      title: "Operational risk",
      content: "Incorrect escalation could delay incident handling.",
    });

    const suggestions = suggestArtifactConsolidations([
      first,
      second,
      unrelated,
    ]);
    const merge = suggestions.find((suggestion) => suggestion.kind === "merge");

    expect(merge).toMatchObject({
      kind: "merge",
      sourceArtifactIds: [first.id, second.id],
      status: "pending",
    });
    expect(merge?.proposedRequirements[0]?.content).toContain(
      "active customer alarms",
    );
    expect(
      [first, second, unrelated].map((artifact) => artifact.status),
    ).toEqual(["draft", "draft", "draft"]);
  });

  it("merges duplicate drafts into one accepted requirement with provenance links", () => {
    const first = draftArtifact({
      id: "artifact-requirement-1",
      title: "Alarm overview",
      content: "Dashboard should show active customer alarms.",
    });
    const second = draftArtifact({
      id: "artifact-requirement-2",
      title: "Customer alarm list",
      content: "The dashboard must display active alarms for each customer.",
    });
    const session = sessionWithArtifacts([first, second]);

    const next = mergeArtifactsIntoRequirement(
      session,
      [first.id, second.id],
      {
        title: "Customer alarm overview",
        content:
          "The dashboard must show active customer alarms in one overview.",
      },
      updatedAt,
    );
    const merged = next.artifacts.at(-1);

    expect(merged).toMatchObject({
      id: "artifact-requirement-3",
      type: "requirement",
      title: "Customer alarm overview",
      status: "accepted",
      source: {
        artifactId: first.id,
        participantId: participantIds.facilitator,
      },
    });
    expect(merged?.tags).toEqual(
      expect.arrayContaining(["consolidated", "merged"]),
    );
    expect(
      next.artifacts
        .filter((artifact) => [first.id, second.id].includes(artifact.id))
        .map((artifact) => artifact.status),
    ).toEqual(["parked", "parked"]);
    expect(next.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceArtifactId: first.id,
          targetArtifactId: merged?.id,
          label: "merged into",
        }),
        expect.objectContaining({
          sourceArtifactId: second.id,
          targetArtifactId: merged?.id,
          label: "merged into",
        }),
      ]),
    );
    expect(next.selectedArtifactId).toBe(merged?.id);
    expect(session.artifacts[0]?.status).toBe("draft");
  });

  it("splits one broad draft into accepted requirements that trace to the source", () => {
    const broad = draftArtifact({
      id: "artifact-requirement-1",
      title: "Alarm dashboard requirements",
      content:
        "The dashboard should show all active alarms. It should filter alarms by customer.",
    });
    const session = sessionWithArtifacts([broad]);

    const next = splitArtifactIntoRequirements(
      session,
      broad.id,
      [
        {
          title: "Active alarm overview",
          content: "The dashboard must show all active alarms.",
        },
        {
          title: "Customer alarm filter",
          content: "The dashboard must filter alarms by customer.",
        },
      ],
      {},
      updatedAt,
    );
    const splitRequirements = next.artifacts.slice(-2);

    expect(
      next.artifacts.find((artifact) => artifact.id === broad.id),
    ).toMatchObject({
      status: "parked",
      tags: expect.arrayContaining(["split"]),
    });
    expect(splitRequirements).toEqual([
      expect.objectContaining({
        id: "artifact-requirement-2",
        title: "Active alarm overview",
        status: "accepted",
        source: expect.objectContaining({ artifactId: broad.id }),
      }),
      expect.objectContaining({
        id: "artifact-requirement-3",
        title: "Customer alarm filter",
        status: "accepted",
        source: expect.objectContaining({ artifactId: broad.id }),
      }),
    ]);
    expect(next.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceArtifactId: broad.id,
          targetArtifactId: "artifact-requirement-2",
          label: "split into",
        }),
        expect.objectContaining({
          sourceArtifactId: broad.id,
          targetArtifactId: "artifact-requirement-3",
          label: "split into",
        }),
      ]),
    );
  });

  it("rejects consolidation of non-draft source artifacts", () => {
    const accepted = draftArtifact({
      id: "artifact-requirement-1",
      title: "Accepted requirement",
      content: "The dashboard must show active alarms.",
      status: "accepted",
    });
    const session = sessionWithArtifacts([accepted]);

    expect(() =>
      splitArtifactIntoRequirements(session, accepted.id, [
        {
          title: "Active alarm overview",
          content: "The dashboard must show active alarms.",
        },
        {
          title: "Customer alarm filter",
          content: "The dashboard must filter alarms by customer.",
        },
      ]),
    ).toThrow(/must be draft/);
  });

  it("applies a pending merge suggestion into approved first-class requirements", () => {
    const first = draftArtifact({
      id: "artifact-requirement-1",
      title: "Alarm overview",
      content: "Dashboard should show active customer alarms.",
    });
    const second = draftArtifact({
      id: "artifact-requirement-2",
      title: "Customer alarm list",
      content: "The dashboard must display active alarms for each customer.",
    });
    const session = sessionWithArtifacts([first, second]);
    const suggestion = suggestArtifactConsolidations([first, second]).find(
      (candidate) => candidate.kind === "merge",
    );

    if (!suggestion) {
      throw new Error("Expected merge suggestion fixture.");
    }

    const result = applyArtifactConsolidationSuggestion(
      session,
      [],
      {
        ...suggestion,
        proposedRequirements: [
          {
            title: "Customer alarm overview",
            content:
              "The dashboard must show active customer alarms in one overview.",
          },
        ],
      },
      {
        actorId: participantIds.human,
        at: updatedAt,
        approve: true,
        acceptanceCriteria: [
          "The overview lists active alarms for every selected customer.",
        ],
        rationale: "Human approved the merged requirement candidate.",
      },
    );

    expect(result.session.artifacts.at(-1)).toMatchObject({
      type: "requirement",
      status: "accepted",
      tags: expect.arrayContaining(["consolidated", "merged"]),
    });
    expect(result.createdRequirements).toEqual([
      expect.objectContaining({
        title: "Customer alarm overview",
        state: "approved",
        approvedBy: participantIds.human,
      }),
    ]);
    expect(
      result.createdRequirements[0]?.sourceRefs.map(
        (source) => source.artifactId,
      ),
    ).toEqual([
      "artifact-requirement-3",
      "artifact-requirement-1",
      "artifact-requirement-2",
    ]);
    expect(
      result.createdRequirements[0]?.history.map((entry) => entry.action),
    ).toEqual(["created", "edited", "approved"]);
  });
});

function sessionWithArtifacts(artifacts: WorkshopArtifact[]): WorkshopSession {
  return {
    ...createInitialWorkshopSession(createdAt),
    artifacts,
    updatedAt: createdAt,
  };
}

function draftArtifact(args: {
  id: string;
  title: string;
  content: string;
  type?: ArtifactType;
  status?: WorkshopArtifact["status"];
}): WorkshopArtifact {
  return {
    id: args.id,
    type: args.type ?? "requirement",
    title: args.title,
    content: args.content,
    status: args.status ?? "draft",
    createdBy: participantIds.facilitator,
    updatedAt: createdAt,
    source: {
      messageId: "message-1",
      participantId: participantIds.human,
    },
    tags: ["candidate"],
  };
}
