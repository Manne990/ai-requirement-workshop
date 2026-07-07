import { describe, expect, it } from "vitest";
import { auditRequirementHistory, createAuditEvent } from "./audit";
import { createProductionExportPackage } from "./productionExport";
import {
  approveRequirement,
  baselineRequirement,
  createRequirement,
  reviseRequirement,
} from "./requirements";
import {
  addPrototypeVersion,
  createPrototype,
  prototypeRequirementRefFromRequirement,
} from "./prototype";
import type { WorkshopSession } from "./workshop";

const organizationId = "org-review";
const workshopId = "workshop-review";
const generatedAt = "2026-07-06T12:00:00.000Z";

describe("production export package", () => {
  it("combines stakeholder report, audit evidence, coverage, quality, and prototype summary", () => {
    const approvedRequirement = approveRequirement(
      reviseRequirement(
        createRequirement({
          id: "requirement-alarm-status",
          title: "Fresh alarm dashboard",
          statement:
            "The operator should view alarm status within 60 seconds so that stale incidents are visible. Acceptance criteria: Given an alarm changes, then the dashboard updates within 60 seconds. Security audit logging records access.",
          state: "candidate",
          createdAt: "2026-07-06T09:02:00.000Z",
          createdBy: "agent-quality",
          acceptanceCriteria: [
            "Given an alarm changes, then the dashboard updates within 60 seconds.",
          ],
          rationale: "Derived from workshop source material.",
          sourceRefs: [
            {
              artifactId: "artifact-requirement-1",
              messageId: "message-source",
              participantId: "human-1",
            },
          ],
        }),
        {
          statement:
            "The operator should view alarm status within 60 seconds so that stale incidents are visible. Acceptance criteria: Given an alarm changes, then the dashboard updates within 60 seconds. Security audit logging records access. Never expose api_key=sk-abcdefghijklmnopqrstuvwxyz123456.",
        },
        {
          actorId: "agent-quality",
          at: "2026-07-06T09:05:00.000Z",
          rationale: "Added explicit secret handling.",
        },
      ),
      {
        actorId: "product-owner",
        at: "2026-07-06T09:10:00.000Z",
        rationale: "Accepted for stakeholder review.",
      },
    );
    const auditEvents = [
      ...auditRequirementHistory(approvedRequirement, {
        organizationId,
        workshopId,
      }),
      createAuditEvent({
        sequence: 9,
        organizationId,
        workshopId,
        actorId: "product-owner",
        at: "2026-07-06T09:30:00.000Z",
        category: "export",
        action: "export.generated",
        target: { type: "export", id: "export-1" },
        summary: "Production review package generated.",
        metadata: { generator: "createProductionExportPackage" },
      }),
    ];
    const prototype = addPrototypeVersion(
      createPrototype(
        workshopId,
        [prototypeRequirementRefFromRequirement(approvedRequirement)],
        {
          prototypeId: "prototype-alarm-review",
          title: "Alarm review",
          actorId: "agent-ux",
          at: "2026-07-06T09:20:00.000Z",
          sourceModel: {
            provider: "manual",
            model: "prototype-test-model",
            promptVersion: "prod-export-test",
          },
        },
      ),
      [prototypeRequirementRefFromRequirement(approvedRequirement)],
      {
        actorId: "agent-ux",
        at: "2026-07-06T09:25:00.000Z",
        sourceModel: {
          provider: "manual",
          model: "prototype-test-model",
          promptVersion: "prod-export-test",
        },
      },
    );
    const session = createReviewSession([prototype]);
    const traceability = completeTraceabilityInput();

    const first = createProductionExportPackage({
      session,
      requirements: [approvedRequirement],
      auditEvents,
      organizationId,
      workshopId,
      generatedAt,
      traceability,
    });
    const second = createProductionExportPackage({
      session,
      requirements: [approvedRequirement],
      auditEvents,
      organizationId,
      workshopId,
      generatedAt,
      traceability,
    });

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      schema_version: 1,
      kind: "AI_REQUIREMENT_WORKSHOP_PRODUCTION_REVIEW_PACKAGE",
      readiness: "ready",
      provenance: {
        source: "saved-workshop-state",
        generator: "createProductionExportPackage",
        input: {
          messageCount: 1,
          artifactCount: 5,
          requirementCount: 1,
          approvedRequirementCount: 1,
          auditEventCount: 4,
          attachmentCount: 1,
          prototypeCount: 1,
          prototypeVersionCount: 2,
        },
      },
    });
    expect(
      first.stakeholderReport.sections.map((section) => section.id),
    ).toEqual(["context", "requirements", "risks", "decisions"]);
    expect(first.requirementRegister[0]).toMatchObject({
      id: "requirement-alarm-status",
      state: "approved",
      auditEventIds: [
        "workshop-review:audit-0001",
        "workshop-review:audit-0002",
        "workshop-review:audit-0003",
      ],
    });
    expect(first.audit).toMatchObject({
      summary: {
        eventCount: 4,
        latestEventAt: "2026-07-06T09:30:00.000Z",
      },
      missingEvidenceWarnings: [],
      exportEventIds: ["workshop-review:audit-0009"],
    });
    expect(first.traceability).toMatchObject({
      nodeCount: expect.any(Number),
      linkCount: expect.any(Number),
      gapCount: expect.any(Number),
      coveragePercent: expect.any(Number),
      reviewRequirementNodeIds: ["requirement:artifact-requirement-1"],
      reviewGapCount: 0,
      reviewGaps: [],
    });
    expect(first.traceability.gaps).toEqual([]);
    expect(first.requirementQuality.blockerCount).toBe(0);
    expect(first.prototypeSummary).toMatchObject({
      prototypeCount: 1,
      currentVersionCount: 1,
      coveredRequirementIds: ["requirement-alarm-status"],
      prototypes: [
        {
          id: "prototype-alarm-review",
          currentVersion: 2,
          current: {
            requirementCount: 1,
            coveredRequirementCount: 1,
            uncoveredRequirementIds: [],
            elementCount: 2,
          },
        },
      ],
    });
    expect(first.appendix.attachments[0]).not.toHaveProperty("extractedText");
    expect(first.redactions.map((finding) => finding.kind)).toContain(
      "openai-api-key",
    );
    expect(JSON.stringify(first)).not.toContain(
      "sk-abcdefghijklmnopqrstuvwxyz",
    );
  });

  it("blocks production readiness when a prototype covers a requirement without a validation test", () => {
    const approvedRequirement = approveRequirement(
      createRequirement({
        id: "requirement-alarm-status",
        title: "Fresh alarm dashboard",
        statement:
          "The operator should view alarm status within 60 seconds so that stale incidents are visible. Acceptance criteria: Given an alarm changes, then the dashboard updates within 60 seconds. Security audit logging records access.",
        state: "candidate",
        createdAt: "2026-07-06T09:02:00.000Z",
        createdBy: "agent-quality",
        acceptanceCriteria: [
          "Given an alarm changes, then the dashboard updates within 60 seconds.",
        ],
        rationale: "Derived from workshop source material.",
        sourceRefs: [
          {
            artifactId: "artifact-requirement-1",
            messageId: "message-source",
            participantId: "human-1",
          },
        ],
      }),
      {
        actorId: "product-owner",
        at: "2026-07-06T09:10:00.000Z",
        rationale: "Accepted for stakeholder review.",
      },
    );
    const prototype = createPrototype(
      workshopId,
      [prototypeRequirementRefFromRequirement(approvedRequirement)],
      {
        prototypeId: "prototype-alarm-review",
        title: "Alarm review",
        actorId: "agent-ux",
        at: "2026-07-06T09:20:00.000Z",
        sourceModel: {
          provider: "manual",
          model: "prototype-test-model",
          promptVersion: "prod-export-test",
        },
      },
    );

    const exported = createProductionExportPackage({
      session: createReviewSession([prototype]),
      requirements: [approvedRequirement],
      auditEvents: auditRequirementHistory(approvedRequirement, {
        organizationId,
        workshopId,
      }),
      organizationId,
      workshopId,
      generatedAt,
      traceability: prototypeOnlyTraceabilityInput(),
    });

    expect(exported.prototypeSummary.coveredRequirementIds).toEqual([
      "requirement-alarm-status",
    ]);
    expect(exported.readiness).toBe("blocked");
    expect(exported.traceability.reviewGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expectationId: "requirement-test",
          targetNodeId: "requirement:artifact-requirement-1",
        }),
      ]),
    );
  });

  it("prefers baselined requirements while retaining non-review traceability gaps", () => {
    const baselinedRequirement = baselineRequirement(
      approveRequirement(
        createRequirement({
          id: "requirement-alarm-status",
          title: "Fresh alarm dashboard",
          statement:
            "The operator should view alarm status within 60 seconds so that stale incidents are visible. Acceptance criteria: Given an alarm changes, then the dashboard updates within 60 seconds. Security audit logging records access.",
          state: "candidate",
          createdAt: "2026-07-06T09:02:00.000Z",
          createdBy: "agent-quality",
          acceptanceCriteria: [
            "Given an alarm changes, then the dashboard updates within 60 seconds.",
          ],
          rationale: "Derived from workshop source material.",
          sourceRefs: [
            {
              artifactId: "artifact-requirement-1",
              messageId: "message-source",
              participantId: "human-1",
            },
          ],
        }),
        {
          actorId: "product-owner",
          at: "2026-07-06T09:10:00.000Z",
          rationale: "Accepted for stakeholder review.",
        },
      ),
      {
        actorId: "facilitator",
        at: "2026-07-06T09:15:00.000Z",
        rationale: "Frozen for production review.",
      },
    );
    const candidateRequirement = createRequirement({
      id: "requirement-draft-only",
      title: "Draft-only workflow",
      statement: "The service should be easy to use.",
      state: "candidate",
      createdAt: "2026-07-06T09:20:00.000Z",
      createdBy: "agent-quality",
      acceptanceCriteria: ["Owner can inspect the workflow."],
      sourceRefs: [{ artifactId: "artifact-draft-only" }],
    });
    const prototype = createPrototype(
      workshopId,
      [prototypeRequirementRefFromRequirement(baselinedRequirement)],
      {
        prototypeId: "prototype-alarm-review",
        title: "Alarm review",
        actorId: "agent-ux",
        at: "2026-07-06T09:20:00.000Z",
        sourceModel: {
          provider: "manual",
          model: "prototype-test-model",
          promptVersion: "prod-export-test",
        },
      },
    );
    const baseSession = createReviewSession([prototype]);
    const session = {
      ...baseSession,
      artifacts: [
        ...baseSession.artifacts,
        {
          id: "artifact-draft-only",
          type: "requirement" as const,
          title: "Draft-only workflow",
          content: "The service should be easy to use.",
          status: "draft" as const,
          createdBy: "agent-quality",
          updatedAt: "2026-07-06T09:20:00.000Z",
          source: {
            messageId: "message-source",
            participantId: "human-1",
          },
          tags: ["requirement"],
        },
      ],
    };

    const exported = createProductionExportPackage({
      session,
      requirements: [candidateRequirement, baselinedRequirement],
      auditEvents: auditRequirementHistory(baselinedRequirement, {
        organizationId,
        workshopId,
      }),
      organizationId,
      workshopId,
      generatedAt,
      traceability: {
        workItems: [
          ...completeTraceabilityInput().workItems,
          {
            id: "orphan-draft-test",
            kind: "test",
            title: "Exploratory draft validation",
          },
        ],
      },
    });

    expect(exported.readiness).toBe("ready");
    expect(exported.requirementRegister).toHaveLength(1);
    expect(exported.requirementRegister[0]).toMatchObject({
      id: "requirement-alarm-status",
      state: "baselined",
    });
    expect(exported.audit.missingEvidenceWarnings).toEqual([]);
    expect(exported.requirementQuality.blockerCount).toBe(0);
    expect(exported.traceability.gapCount).toBeGreaterThan(0);
    expect(exported.traceability.reviewGapCount).toBe(0);
    expect(exported.traceability.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expectationId: "test-target",
          targetNodeId: "test:orphan-draft-test",
        }),
      ]),
    );
  });

  it("blocks review when approved requirements lack audit evidence or quality is failing", () => {
    const requirement = approveRequirement(
      createRequirement({
        id: "requirement-weak",
        title: "Easy workflow",
        statement: "The service should be easy to use.",
        state: "candidate",
        createdAt: "2026-07-06T09:02:00.000Z",
        createdBy: "agent-quality",
        acceptanceCriteria: ["Owner can inspect the workflow."],
        sourceRefs: [{ artifactId: "artifact-requirement-weak" }],
      }),
      {
        actorId: "product-owner",
        at: "2026-07-06T09:10:00.000Z",
        rationale: "Accepted despite weak wording.",
      },
    );
    const session = createBlockedSession();

    const exported = createProductionExportPackage({
      session,
      requirements: [requirement],
      auditEvents: [],
      organizationId,
      generatedAt,
    });

    expect(exported.readiness).toBe("blocked");
    expect(exported.workshopId).toBe(workshopId);
    expect(exported.audit.missingEvidenceWarnings).toEqual([
      "Missing audit event for requirement requirement-weak history requirement-weak:history-1.",
      "Missing audit event for requirement requirement-weak history requirement-weak:history-2.",
    ]);
    expect(exported.requirementQuality.blockerCount).toBeGreaterThan(0);
    expect(exported.traceability.reviewGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expectationId: "requirement-test",
          targetNodeId: "requirement:artifact-requirement-weak",
        }),
        expect.objectContaining({
          expectationId: "requirement-risk-review",
          targetNodeId: "requirement:artifact-requirement-weak",
        }),
      ]),
    );
    expect(exported.requirementRegister[0]?.history).toEqual([
      expect.objectContaining({ auditEventId: undefined }),
      expect.objectContaining({ auditEventId: undefined }),
    ]);
  });
});

function createReviewSession(
  prototypes: WorkshopSession["prototypes"],
): WorkshopSession {
  return {
    id: workshopId,
    title: "Alarm operations",
    participants: [],
    messages: [
      {
        id: "message-source",
        participantId: "human-1",
        kind: "human-input",
        body: "Operators need fresh alarm status for stakeholder review.",
        createdAt: "2026-07-06T09:00:00.000Z",
        relatedArtifactIds: ["artifact-requirement-1", "artifact-risk-1"],
      },
    ],
    attachments: [
      {
        id: "attachment-source",
        name: "alarm-source.csv",
        mimeType: "text/csv",
        size: 256,
        extractedText: "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
        summary: "Operational source fields for alarm status.",
        status: "extracted",
        tags: ["attachment", "file:csv"],
        createdAt: "2026-07-06T09:01:00.000Z",
        sourceMessageId: "message-source",
      },
    ],
    artifacts: [
      {
        id: "artifact-requirement-1",
        type: "requirement",
        title: "Fresh alarm dashboard",
        content:
          "The operator should view alarm status within 60 seconds so that stale incidents are visible. Acceptance criteria: Given an alarm changes, then the dashboard updates within 60 seconds. Security audit logging records access. Never expose api_key=sk-abcdefghijklmnopqrstuvwxyz123456.",
        status: "accepted",
        createdBy: "agent-quality",
        updatedAt: "2026-07-06T09:05:00.000Z",
        source: {
          messageId: "message-source",
          participantId: "human-1",
        },
        tags: ["requirement"],
      },
      {
        id: "artifact-risk-1",
        type: "risk",
        title: "Stale alarm data",
        content: "Delayed data can cause operators to miss critical alarms.",
        status: "accepted",
        createdBy: "agent-risk",
        updatedAt: "2026-07-06T09:06:00.000Z",
        source: {
          messageId: "message-source",
          participantId: "human-1",
        },
        tags: ["risk"],
      },
      {
        id: "artifact-decision-1",
        type: "decision",
        title: "Use alarm stream",
        content: "Review package uses the alarm stream as the primary source.",
        status: "accepted",
        createdBy: "facilitator",
        updatedAt: "2026-07-06T09:07:00.000Z",
        source: {
          messageId: "message-source",
          participantId: "human-1",
        },
        tags: ["decision"],
      },
      {
        id: "artifact-question-1",
        type: "question",
        title: "Retention period",
        content: "How long should alarm extract summaries be retained?",
        status: "draft",
        createdBy: "agent-risk",
        updatedAt: "2026-07-06T09:08:00.000Z",
        source: {
          messageId: "message-source",
          participantId: "human-1",
        },
        tags: ["question"],
      },
      {
        id: "artifact-source-1",
        type: "source",
        title: "alarm-source.csv",
        content: "Operational source fields for alarm status.",
        status: "accepted",
        createdBy: "human-1",
        updatedAt: "2026-07-06T09:01:00.000Z",
        source: {
          messageId: "message-source",
          participantId: "human-1",
        },
        tags: ["source"],
      },
    ],
    links: [],
    prototypes,
    selectedArtifactId: "artifact-requirement-1",
    visualizationMode: "requirements",
    followDiscussion: true,
    updatedAt: "2026-07-06T09:30:00.000Z",
  };
}

function completeTraceabilityInput() {
  return {
    workItems: [
      {
        id: "requirement-validation-test",
        kind: "test" as const,
        title: "Requirement validation contract test",
        covers: ["artifact-requirement-1"],
      },
      {
        id: "risk-monitoring-test",
        kind: "test" as const,
        title: "Risk monitoring contract test",
        covers: ["artifact-risk-1"],
      },
    ],
  };
}

function prototypeOnlyTraceabilityInput() {
  return {
    workItems: [
      {
        id: "risk-monitoring-test",
        kind: "test" as const,
        title: "Risk monitoring contract test",
        covers: ["artifact-risk-1"],
      },
    ],
  };
}

function createBlockedSession(): WorkshopSession {
  return {
    ...createReviewSession([]),
    artifacts: [
      {
        id: "artifact-requirement-weak",
        type: "requirement",
        title: "Easy workflow",
        content: "The service should be easy to use.",
        status: "accepted",
        createdBy: "agent-quality",
        updatedAt: "2026-07-06T09:05:00.000Z",
        source: {
          messageId: "message-source",
          participantId: "human-1",
        },
        tags: ["requirement"],
      },
    ],
    attachments: [],
    prototypes: [],
  };
}
