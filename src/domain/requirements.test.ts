import { describe, expect, it } from "vitest";
import {
  approveRequirement,
  baselineRequirement,
  createRequirement,
  deriveRequirementsFromArtifacts,
  promoteRequirementToCandidate,
  rejectRequirement,
  reopenRequirement,
  reviseRequirement,
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
