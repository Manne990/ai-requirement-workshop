import { describe, expect, it } from "vitest";
import {
  approveRequirement,
  baselineRequirement,
  createRequirement,
  deriveRequirementsFromArtifacts,
  mergeRequirements,
  promoteRequirementToCandidate,
  rejectRequirement,
  reopenRequirement,
  reviseRequirement,
  splitRequirement,
  supersedeRequirement,
  validRequirementTransitions,
  type Requirement,
} from "./requirements";
import type { WorkshopArtifact } from "./workshop";

const candidateArtifact: WorkshopArtifact = {
  id: "artifact-requirement-1",
  type: "requirement",
  title: "Fresh incident summary",
  content: "The system should summarize new incident data within 30 seconds.",
  status: "draft",
  createdBy: "agent-quality",
  updatedAt: "2026-07-05T09:00:00.000Z",
  source: {
    messageId: "message-1",
    participantId: "human-1",
  },
  tags: ["candidate"],
};

const approvalCommand = {
  actorId: "human-1",
  at: "2026-07-05T09:10:00.000Z",
  rationale: "Owner accepted this as testable and in scope.",
};

describe("requirement lifecycle domain", () => {
  it("derives durable requirement candidates from artifacts with source evidence", () => {
    const derivation = deriveRequirementsFromArtifacts([candidateArtifact]);

    expect(derivation.createdRequirements).toHaveLength(1);
    expect(derivation.linkedArtifactIds).toEqual(["artifact-requirement-1"]);
    expect(derivation.requirements[0]).toMatchObject({
      id: "requirement-artifact-requirement-1",
      title: "Fresh incident summary",
      statement:
        "The system should summarize new incident data within 30 seconds.",
      state: "candidate",
      version: 1,
      sourceRefs: [
        {
          artifactId: "artifact-requirement-1",
          messageId: "message-1",
          participantId: "human-1",
        },
      ],
    });
    expect(derivation.requirements[0]?.history[0]).toMatchObject({
      action: "created",
      toState: "candidate",
    });
  });

  it("approves, rejects, and reopens only through valid transitions", () => {
    const candidate = withCriteria(
      deriveRequirementsFromArtifacts([candidateArtifact]).requirements[0],
    );

    const approved = approveRequirement(candidate, approvalCommand);

    expect(approved.state).toBe("approved");
    expect(approved.version).toBe(3);
    expect(approved.approvedBy).toBe("human-1");
    expect(approved.history.at(-1)).toMatchObject({
      action: "approved",
      fromState: "candidate",
      toState: "approved",
      rationale: "Owner accepted this as testable and in scope.",
    });
    expect(() =>
      rejectRequirement(approved, {
        actorId: "human-1",
        at: "2026-07-05T09:11:00.000Z",
        rationale: "Changed mind.",
      }),
    ).toThrow("Invalid requirement transition from approved to rejected.");

    const reopened = reopenRequirement(approved, {
      actorId: "human-1",
      at: "2026-07-05T09:12:00.000Z",
      rationale: "Scope needs another review.",
    });
    const rejected = rejectRequirement(reopened, {
      actorId: "human-1",
      at: "2026-07-05T09:13:00.000Z",
      rationale: "The response target is not feasible for launch.",
    });
    const candidateAgain = reopenRequirement(rejected, {
      actorId: "human-1",
      at: "2026-07-05T09:14:00.000Z",
      rationale: "Reworking this for the next release.",
    });

    expect(candidateAgain.state).toBe("candidate");
    expect(candidateAgain.history.map((entry) => entry.action)).toEqual([
      "created",
      "edited",
      "approved",
      "reopened",
      "rejected",
      "reopened",
    ]);
  });

  it("requires acceptance criteria and source evidence before approval", () => {
    const candidate = deriveRequirementsFromArtifacts([candidateArtifact])
      .requirements[0];

    expect(() => approveRequirement(candidate, approvalCommand)).toThrow(
      "Approved requirements need acceptance criteria.",
    );

    const sourceLess = reviseRequirement(
      withCriteria(candidate),
      {
        sourceRefs: [],
      },
      {
        actorId: "agent-quality",
        at: "2026-07-05T09:08:00.000Z",
        rationale: "Testing source validation.",
      },
    );

    expect(() => approveRequirement(sourceLess, approvalCommand)).toThrow(
      "Approved requirements need a source artifact or message.",
    );
  });

  it("prevents artifact pile growth by linking duplicate sources to existing requirements", () => {
    const candidate = withCriteria(
      deriveRequirementsFromArtifacts([candidateArtifact]).requirements[0],
    );
    const approved = approveRequirement(candidate, approvalCommand);
    const duplicateArtifact: WorkshopArtifact = {
      ...candidateArtifact,
      id: "artifact-requirement-2",
      updatedAt: "2026-07-05T09:20:00.000Z",
      source: {
        messageId: "message-2",
        participantId: "human-1",
      },
    };

    const derivation = deriveRequirementsFromArtifacts(
      [candidateArtifact, duplicateArtifact],
      [approved],
      {
        at: "2026-07-05T09:21:00.000Z",
      },
    );

    expect(derivation.requirements).toHaveLength(1);
    expect(derivation.createdRequirements).toHaveLength(0);
    expect(derivation.updatedRequirements).toHaveLength(1);
    expect(derivation.linkedArtifactIds).toEqual([
      "artifact-requirement-1",
      "artifact-requirement-2",
    ]);
    expect(derivation.requirements[0]?.state).toBe("approved");
    expect(
      derivation.requirements[0]?.sourceRefs.map((source) => source.artifactId),
    ).toEqual(["artifact-requirement-1", "artifact-requirement-2"]);
    expect(derivation.requirements[0]?.history.at(-1)?.action).toBe(
      "source-linked",
    );
  });

  it("baselines and supersedes approved requirements while freezing direct edits", () => {
    const approved = approveRequirement(
      withCriteria(
        deriveRequirementsFromArtifacts([candidateArtifact]).requirements[0],
      ),
      approvalCommand,
    );

    const baselined = baselineRequirement(approved, {
      actorId: "facilitator",
      at: "2026-07-05T09:30:00.000Z",
      rationale: "Included in release baseline 1.",
    });

    expect(baselined.state).toBe("baselined");
    expect(baselined.baselinedBy).toBe("facilitator");
    expect(() =>
      reviseRequirement(
        baselined,
        { statement: "The target is now 60 seconds." },
        {
          actorId: "agent-quality",
          at: "2026-07-05T09:31:00.000Z",
          rationale: "Updating target.",
        },
      ),
    ).toThrow("Cannot edit a baselined requirement");

    const replacement = createRequirement({
      id: "requirement-replacement",
      title: "Fresh incident summary v2",
      statement: "The system should summarize incident data within 60 seconds.",
      state: "candidate",
      createdAt: "2026-07-05T09:32:00.000Z",
      createdBy: "agent-quality",
      acceptanceCriteria: ["Summary appears within 60 seconds."],
      sourceRefs: [{ messageId: "message-3", participantId: "human-1" }],
      rationale: "Replacement candidate for the next baseline.",
    });

    const superseded = supersedeRequirement(baselined, replacement.id, {
      actorId: "human-1",
      at: "2026-07-05T09:35:00.000Z",
      rationale: "Response target changed after technical sizing.",
    });

    expect(superseded).toMatchObject({
      state: "superseded",
      supersededByRequirementId: "requirement-replacement",
    });
    expect(validRequirementTransitions("superseded")).toEqual([]);
  });

  it("promotes drafts before approval", () => {
    const draft = createRequirement({
      id: "requirement-draft-1",
      title: "Audit trail",
      statement: "The system must show who approved each requirement.",
      createdAt: "2026-07-05T10:00:00.000Z",
      createdBy: "agent-quality",
      acceptanceCriteria: ["Approval records include actor and timestamp."],
      sourceRefs: [{ messageId: "message-4", participantId: "human-1" }],
    });

    expect(() => approveRequirement(draft, approvalCommand)).toThrow(
      "Invalid requirement transition from draft to approved.",
    );

    const candidate = promoteRequirementToCandidate(draft, {
      actorId: "facilitator",
      at: "2026-07-05T10:01:00.000Z",
      rationale: "Ready for owner approval.",
    });

    expect(candidate.state).toBe("candidate");
    expect(approveRequirement(candidate, approvalCommand).state).toBe(
      "approved",
    );
  });

  it("merges requirement candidates into one approved replacement with history and provenance", () => {
    const first = withCriteria(
      deriveRequirementsFromArtifacts([candidateArtifact]).requirements[0],
    );
    const second = withCriteria(
      deriveRequirementsFromArtifacts([
        {
          ...candidateArtifact,
          id: "artifact-requirement-2",
          title: "Incident summary source names",
          content:
            "The system should show which source systems contributed to the incident summary.",
          source: {
            messageId: "message-2",
            participantId: "human-1",
          },
        },
      ]).requirements[0],
    );

    const result = mergeRequirements(
      [first, second],
      [first.id, second.id],
      {
        id: "requirement-incident-summary",
        title: "Incident summary",
        statement:
          "The system should summarize new incident data and name the source systems used.",
        state: "approved",
      },
      {
        actorId: "human-1",
        at: "2026-07-05T10:20:00.000Z",
        rationale: "Merged overlapping summary requirements for approval.",
      },
    );

    const merged = result.createdRequirements[0];

    expect(merged).toMatchObject({
      id: "requirement-incident-summary",
      state: "approved",
      version: 2,
      approvedBy: "human-1",
    });
    expect(merged?.history.map((entry) => entry.action)).toEqual([
      "merged",
      "approved",
    ]);
    expect(
      merged?.sourceRefs.map((source) => source.artifactId).sort(),
    ).toEqual(["artifact-requirement-1", "artifact-requirement-2"]);
    expect(result.supersededRequirements).toEqual([
      expect.objectContaining({
        id: first.id,
        state: "superseded",
        supersededByRequirementIds: ["requirement-incident-summary"],
      }),
      expect.objectContaining({
        id: second.id,
        state: "superseded",
        supersededByRequirementIds: ["requirement-incident-summary"],
      }),
    ]);
    expect(
      result.requirements.filter(
        (requirement) => requirement.state === "approved",
      ),
    ).toHaveLength(1);
  });

  it("splits one broad requirement into approved replacements", () => {
    const broad = approveRequirement(
      reviseRequirement(
        createRequirement({
          id: "requirement-broad-dashboard",
          title: "Alarm dashboard",
          statement:
            "The dashboard should show active alarms and filter alarms by customer.",
          state: "candidate",
          createdAt: "2026-07-05T11:00:00.000Z",
          createdBy: "agent-quality",
          acceptanceCriteria: [
            "Active alarms are visible.",
            "Customer filtering is available.",
          ],
          sourceRefs: [
            {
              artifactId: "artifact-requirement-10",
              messageId: "message-10",
              participantId: "human-1",
            },
          ],
        }),
        { rationale: "Broad draft needs lifecycle coverage." },
        {
          actorId: "agent-quality",
          at: "2026-07-05T11:01:00.000Z",
          rationale: "Documented the source rationale.",
        },
      ),
      {
        actorId: "human-1",
        at: "2026-07-05T11:02:00.000Z",
        rationale: "Owner accepted the broad requirement before splitting.",
      },
    );

    const result = splitRequirement(
      [broad],
      broad.id,
      [
        {
          id: "requirement-active-alarm-overview",
          title: "Active alarm overview",
          statement: "The dashboard must show all active alarms.",
          state: "approved",
          acceptanceCriteria: ["Active alarms appear in the overview."],
        },
        {
          id: "requirement-customer-alarm-filter",
          title: "Customer alarm filter",
          statement: "The dashboard must filter alarms by customer.",
          state: "approved",
          acceptanceCriteria: ["Users can filter alarms by customer."],
        },
      ],
      {
        actorId: "human-1",
        at: "2026-07-05T11:10:00.000Z",
        rationale: "Split broad requirement into independently testable items.",
      },
    );

    expect(result.supersededRequirements[0]).toMatchObject({
      id: broad.id,
      state: "superseded",
      supersededByRequirementIds: [
        "requirement-active-alarm-overview",
        "requirement-customer-alarm-filter",
      ],
    });
    expect(
      result.createdRequirements.map((requirement) => ({
        id: requirement.id,
        state: requirement.state,
        sourceRefs: requirement.sourceRefs,
        actions: requirement.history.map((entry) => entry.action),
      })),
    ).toEqual([
      {
        id: "requirement-active-alarm-overview",
        state: "approved",
        sourceRefs: broad.sourceRefs,
        actions: ["split", "approved"],
      },
      {
        id: "requirement-customer-alarm-filter",
        state: "approved",
        sourceRefs: broad.sourceRefs,
        actions: ["split", "approved"],
      },
    ]);
  });

  it("does not consolidate rejected or already superseded requirements", () => {
    const rejected = rejectRequirement(
      deriveRequirementsFromArtifacts([candidateArtifact]).requirements[0]!,
      {
        actorId: "human-1",
        at: "2026-07-05T12:00:00.000Z",
        rationale: "Out of scope.",
      },
    );
    const candidate = withCriteria(
      deriveRequirementsFromArtifacts([
        {
          ...candidateArtifact,
          id: "artifact-requirement-2",
        },
      ]).requirements[0],
    );

    expect(() =>
      mergeRequirements(
        [rejected, candidate],
        [rejected.id, candidate.id],
        {
          id: "requirement-merged",
          title: "Merged",
          statement: "The system should merge valid material.",
        },
        {
          actorId: "human-1",
          at: "2026-07-05T12:01:00.000Z",
          rationale: "Testing rejected guard.",
        },
      ),
    ).toThrow(/cannot be consolidated from rejected/);
  });
});

function withCriteria(requirement: Requirement | undefined) {
  if (!requirement) {
    throw new Error("Expected requirement fixture.");
  }

  return reviseRequirement(
    requirement,
    {
      acceptanceCriteria: [
        "Summary appears within 30 seconds of new incident data.",
        "Summary names the source systems used.",
      ],
    },
    {
      actorId: "agent-quality",
      at: "2026-07-05T09:05:00.000Z",
      rationale: "Added measurable acceptance criteria.",
    },
  );
}
