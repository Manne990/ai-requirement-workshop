import { describe, expect, it } from "vitest";
import {
  applyRuntimeConsolidationSuggestion,
  applyRuntimeConsolidationSuggestionWithLedger,
  approveRequirementPanelItem,
  baselineRequirementPanelItem,
  parkRuntimeConsolidationSuggestion,
  recordRequirementPanelLedgerAction,
  recordRuntimeConsolidationDecision,
  rejectRequirementPanelItem,
  selectConsolidationPanelArtifacts,
  selectConsolidationPanelSuggestionsFromSession,
  selectRequirementPanelItemsFromSession,
  supersedeRequirementPanelItem,
} from "./requirementRuntime";
import {
  createInitialWorkshopSession,
  participantIds,
  type ArtifactType,
  type WorkshopArtifact,
  type WorkshopSession,
} from "./workshop";

const createdAt = "2026-07-06T09:00:00.000Z";
const updatedAt = "2026-07-06T09:15:00.000Z";

describe("requirement runtime adapter", () => {
  it("selects RequirementsPanel items from a workshop session", () => {
    const session = sessionWithArtifacts([
      artifact({
        id: "artifact-requirement-1",
        title: "Incident summary",
        content: "The dashboard should summarize active incidents.",
        tags: ["candidate"],
      }),
      artifact({
        id: "artifact-risk-1",
        type: "risk",
        title: "Escalation risk",
        content: "Escalation may be delayed.",
        tags: ["risk"],
      }),
      artifact({
        id: "artifact-requirement-2",
        title: "Audited decisions",
        content: "The system must retain accepted decisions.",
        status: "accepted",
        tags: [],
      }),
    ]);

    const items = selectRequirementPanelItemsFromSession(session);

    expect(items).toEqual([
      expect.objectContaining({
        id: "artifact-requirement-1",
        title: "Incident summary",
        status: "candidate",
        sourceMessageIds: ["message-1"],
      }),
      expect.objectContaining({
        id: "artifact-requirement-2",
        title: "Audited decisions",
        status: "approved",
      }),
    ]);
  });

  it("selects ConsolidationPanel artifacts and suggestions from session artifacts", () => {
    const session = sessionWithArtifacts([
      artifact({
        id: "artifact-requirement-1",
        title: "Alarm overview",
        content: "Dashboard should show active customer alarms.",
      }),
      artifact({
        id: "artifact-requirement-2",
        title: "Customer alarm list",
        content: "The dashboard must display active alarms for each customer.",
      }),
    ]);

    const artifacts = selectConsolidationPanelArtifacts(session);
    const suggestions = selectConsolidationPanelSuggestionsFromSession(session);

    expect(artifacts[0]).toEqual({
      id: "artifact-requirement-1",
      type: "requirement",
      title: "Alarm overview",
      content: "Dashboard should show active customer alarms.",
      status: "draft",
    });
    expect(suggestions).toEqual([
      expect.objectContaining({
        id: "consolidation-merge-artifact-requirement-1-artifact-requirement-2",
        kind: "merge",
        title: "Merge Alarm overview and Customer alarm list",
        state: "pending",
        sourceArtifactIds: ["artifact-requirement-1", "artifact-requirement-2"],
        proposedRequirements: [
          expect.objectContaining({
            title: "Alarm overview",
            sourceArtifactIds: [
              "artifact-requirement-1",
              "artifact-requirement-2",
            ],
          }),
        ],
      }),
    ]);
  });

  it("approves, rejects, supersedes, and baselines requirement artifacts immutably", () => {
    const session = sessionWithArtifacts([
      artifact({
        id: "artifact-requirement-1",
        title: "Candidate",
        content: "The system should show candidate requirements.",
        tags: ["candidate"],
      }),
      artifact({
        id: "artifact-requirement-2",
        title: "Approved",
        content: "The system must show approved requirements.",
        status: "accepted",
        tags: ["approved"],
      }),
    ]);

    const approved = approveRequirementPanelItem(
      session,
      "artifact-requirement-1",
      { at: updatedAt },
    );
    const rejected = rejectRequirementPanelItem(
      approved,
      "artifact-requirement-1",
      { at: "2026-07-06T09:16:00.000Z" },
    );
    const baselined = baselineRequirementPanelItem(
      rejected,
      "artifact-requirement-2",
      { at: "2026-07-06T09:17:00.000Z" },
    );
    const superseded = supersedeRequirementPanelItem(
      baselined,
      "artifact-requirement-2",
      { at: "2026-07-06T09:18:00.000Z" },
    );

    expect(session.artifacts[0]?.status).toBe("draft");
    expect(approved.artifacts[0]).toMatchObject({
      status: "accepted",
      updatedAt,
      tags: expect.arrayContaining(["candidate", "approved"]),
    });
    expect(rejected.artifacts[0]).toMatchObject({
      status: "rejected",
      tags: expect.arrayContaining(["candidate", "rejected"]),
    });
    expect(rejected.artifacts[0]?.tags).not.toContain("approved");
    expect(baselined.artifacts[1]).toMatchObject({
      status: "accepted",
      tags: expect.arrayContaining(["approved", "baseline"]),
    });
    expect(baselined.selectedArtifactId).toBe("artifact-requirement-2");
    expect(superseded.artifacts[1]).toMatchObject({
      status: "parked",
      tags: expect.arrayContaining(["supersede"]),
    });
    expect(superseded.artifacts[1]?.tags).not.toContain("approved");
  });

  it("rejects baselining a non-approved requirement artifact", () => {
    const session = sessionWithArtifacts([
      artifact({
        id: "artifact-requirement-1",
        title: "Draft",
        content: "The system should show draft requirements.",
        tags: ["candidate"],
      }),
    ]);

    expect(() =>
      baselineRequirementPanelItem(session, "artifact-requirement-1", {
        at: updatedAt,
      }),
    ).toThrow("Only approved requirements can be baselined.");
  });

  it("applies a runtime consolidation suggestion into the workshop session", () => {
    const session = sessionWithArtifacts([
      artifact({
        id: "artifact-requirement-1",
        title: "Alarm overview",
        content: "Dashboard should show active customer alarms.",
      }),
      artifact({
        id: "artifact-requirement-2",
        title: "Customer alarm list",
        content: "The dashboard must display active alarms for each customer.",
      }),
    ]);
    const [suggestion] =
      selectConsolidationPanelSuggestionsFromSession(session);

    if (!suggestion) {
      throw new Error("Expected consolidation suggestion fixture.");
    }

    const next = applyRuntimeConsolidationSuggestion(session, suggestion, {
      actorId: participantIds.human,
      at: updatedAt,
    });

    expect(next.artifacts).toHaveLength(3);
    expect(next.artifacts.at(-1)).toMatchObject({
      id: "artifact-requirement-3",
      type: "requirement",
      status: "accepted",
      createdBy: participantIds.human,
      tags: expect.arrayContaining(["consolidated", "merged"]),
    });
    expect(
      next.artifacts
        .filter((artifact) =>
          ["artifact-requirement-1", "artifact-requirement-2"].includes(
            artifact.id,
          ),
        )
        .map((artifact) => artifact.status),
    ).toEqual(["parked", "parked"]);
    expect(session.artifacts).toHaveLength(2);
  });

  it("records applied consolidation suggestions into the durable requirement ledger", () => {
    const session = sessionWithArtifacts([
      artifact({
        id: "artifact-requirement-1",
        title: "Alarm overview",
        content: "Dashboard should show active customer alarms.",
      }),
      artifact({
        id: "artifact-requirement-2",
        title: "Customer alarm list",
        content: "The dashboard must display active alarms for each customer.",
      }),
    ]);
    const [suggestion] =
      selectConsolidationPanelSuggestionsFromSession(session);

    if (!suggestion) {
      throw new Error("Expected consolidation suggestion fixture.");
    }

    const result = applyRuntimeConsolidationSuggestionWithLedger(
      session,
      { requirements: [], auditEvents: [] },
      suggestion,
      {
        organizationId: "org-1",
        workshopId: session.id,
      },
      {
        actorId: participantIds.human,
        at: updatedAt,
      },
    );

    expect(result.session.artifacts.at(-1)).toMatchObject({
      id: "artifact-requirement-3",
      status: "accepted",
      tags: expect.arrayContaining(["consolidated", "merged"]),
    });
    expect(result.ledger.requirements).toHaveLength(1);
    expect(result.ledger.requirements[0]).toMatchObject({
      id: "requirement-artifact-requirement-3",
      state: "approved",
      approvedBy: participantIds.human,
    });
    expect(
      result.ledger.requirements[0]?.sourceRefs.map(
        (source) => source.artifactId,
      ),
    ).toEqual([
      "artifact-requirement-3",
      "artifact-requirement-1",
      "artifact-requirement-2",
    ]);
    expect(result.createdRequirementIds).toEqual([
      "requirement-artifact-requirement-3",
    ]);
    expect(result.ledger.auditEvents.map((event) => event.action)).toEqual([
      "requirement.created",
      "requirement.edited",
      "requirement.approved",
    ]);
  });

  it("parks a runtime consolidation suggestion without creating requirements", () => {
    const session = sessionWithArtifacts([
      artifact({
        id: "artifact-requirement-1",
        title: "Alarm overview",
        content: "Dashboard should show active customer alarms.",
      }),
      artifact({
        id: "artifact-requirement-2",
        title: "Customer alarm list",
        content: "The dashboard must display active alarms for each customer.",
      }),
    ]);
    const [suggestion] =
      selectConsolidationPanelSuggestionsFromSession(session);

    if (!suggestion) {
      throw new Error("Expected consolidation suggestion fixture.");
    }

    const parked = parkRuntimeConsolidationSuggestion(session, suggestion.id, {
      at: updatedAt,
    });

    expect(parked.artifacts).toHaveLength(2);
    expect(parked.artifacts.map((candidate) => candidate.status)).toEqual([
      "parked",
      "parked",
    ]);
    expect(parked.artifacts[0]?.tags).toEqual(
      expect.arrayContaining(["consolidation-parked"]),
    );
    expect(selectConsolidationPanelSuggestionsFromSession(parked)).toEqual([]);
  });

  it("records consolidation decisions into the durable audit ledger once", () => {
    const session = sessionWithArtifacts([
      artifact({
        id: "artifact-requirement-1",
        title: "Alarm overview",
        content: "Dashboard should show active customer alarms.",
      }),
      artifact({
        id: "artifact-requirement-2",
        title: "Customer alarm list",
        content: "The dashboard must display active alarms for each customer.",
      }),
    ]);
    const [suggestion] =
      selectConsolidationPanelSuggestionsFromSession(session);

    if (!suggestion) {
      throw new Error("Expected consolidation suggestion fixture.");
    }

    const context = {
      organizationId: "org-1",
      workshopId: session.id,
    };
    const applied = recordRuntimeConsolidationDecision(
      { requirements: [], auditEvents: [] },
      suggestion,
      "applied",
      context,
      {
        actorId: participantIds.human,
        at: updatedAt,
        outputRequirementIds: ["requirement-artifact-requirement-3"],
      },
    );
    const duplicate = recordRuntimeConsolidationDecision(
      applied,
      suggestion,
      "applied",
      context,
      {
        actorId: participantIds.human,
        at: updatedAt,
      },
    );
    const parked = recordRuntimeConsolidationDecision(
      duplicate,
      suggestion,
      "parked",
      context,
      {
        actorId: participantIds.human,
        at: "2026-07-06T09:16:00.000Z",
      },
    );

    expect(duplicate.auditEvents).toHaveLength(1);
    expect(parked.auditEvents.map((event) => event.action)).toEqual([
      "consolidation.applied",
      "consolidation.parked",
    ]);
    expect(parked.auditEvents[0]).toMatchObject({
      id: `${session.id}:audit-0001`,
      category: "consolidation",
      target: {
        type: "consolidation",
        id: suggestion.id,
      },
      metadata: {
        kind: "merge",
        sourceArtifactIds: ["artifact-requirement-1", "artifact-requirement-2"],
        outputRequirementIds: ["requirement-artifact-requirement-3"],
      },
    });
  });

  it("records requirement panel lifecycle actions into a durable ledger", () => {
    const session = sessionWithArtifacts([
      artifact({
        id: "artifact-requirement-1",
        title: "Alarm overview",
        content: "The dashboard should show active customer alarms.",
        tags: ["candidate"],
      }),
    ]);

    const approvedSession = approveRequirementPanelItem(
      session,
      "artifact-requirement-1",
      {
        actorId: participantIds.human,
        at: "2026-07-06T09:20:00.000Z",
      },
    );
    const approvedLedger = recordRequirementPanelLedgerAction(
      approvedSession,
      { requirements: [], auditEvents: [] },
      "artifact-requirement-1",
      "approved",
      {
        organizationId: "org-1",
        workshopId: approvedSession.id,
      },
      {
        actorId: participantIds.human,
        at: "2026-07-06T09:20:00.000Z",
      },
    );

    expect(approvedLedger.requirements).toHaveLength(1);
    expect(approvedLedger.requirements[0]).toMatchObject({
      id: "requirement-artifact-requirement-1",
      state: "approved",
      version: 2,
      approvedBy: participantIds.human,
    });
    expect(approvedLedger.auditEvents.map((event) => event.action)).toEqual([
      "requirement.created",
      "requirement.approved",
    ]);

    const baselinedSession = baselineRequirementPanelItem(
      approvedSession,
      "artifact-requirement-1",
      {
        actorId: participantIds.human,
        at: "2026-07-06T09:25:00.000Z",
      },
    );
    const baselinedLedger = recordRequirementPanelLedgerAction(
      baselinedSession,
      approvedLedger,
      "artifact-requirement-1",
      "baselined",
      {
        organizationId: "org-1",
        workshopId: approvedSession.id,
      },
      {
        actorId: participantIds.human,
        at: "2026-07-06T09:25:00.000Z",
      },
    );
    const duplicateLedger = recordRequirementPanelLedgerAction(
      baselinedSession,
      baselinedLedger,
      "artifact-requirement-1",
      "baselined",
      {
        organizationId: "org-1",
        workshopId: approvedSession.id,
      },
      {
        actorId: participantIds.human,
        at: "2026-07-06T09:25:00.000Z",
      },
    );

    expect(baselinedLedger.requirements[0]).toMatchObject({
      state: "baselined",
      version: 3,
      baselinedBy: participantIds.human,
    });
    expect(baselinedLedger.auditEvents.map((event) => event.action)).toEqual([
      "requirement.created",
      "requirement.approved",
      "requirement.baselined",
    ]);
    expect(duplicateLedger.auditEvents).toHaveLength(
      baselinedLedger.auditEvents.length,
    );
  });
});

function sessionWithArtifacts(artifacts: WorkshopArtifact[]): WorkshopSession {
  return {
    ...createInitialWorkshopSession(createdAt, "workshop-runtime-test"),
    artifacts,
    updatedAt: createdAt,
  };
}

function artifact(args: {
  id: string;
  title: string;
  content: string;
  type?: ArtifactType;
  status?: WorkshopArtifact["status"];
  tags?: string[];
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
    tags: args.tags ?? ["candidate"],
  };
}
