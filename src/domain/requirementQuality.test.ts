import { describe, expect, it } from "vitest";
import {
  evaluateRequirementQuality,
  requirementQualityQuestionDraft,
} from "./requirementQuality";
import type { WorkshopArtifact } from "./workshop";

describe("requirement quality", () => {
  it("flags ambiguous, unverifiable, unaccepted, and non-functional gaps", () => {
    const findings = evaluateRequirementQuality(
      [
        requirement({
          content:
            "The service should be easy to use and improve case handling.",
        }),
      ],
      { language: "en" },
    );

    expect(findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining([
        "ambiguity",
        "missing-acceptance-criteria",
        "unverifiable-claim",
        "missing-non-functional-concern",
      ]),
    );
    expect(
      findings.find((finding) => finding.kind === "missing-acceptance-criteria")
        ?.severity,
    ).toBe("blocker");
    expect(
      findings.find((finding) => finding.kind === "ambiguity")?.diagnostics,
    ).toEqual([
      expect.objectContaining({
        code: "quality.ambiguity.vague-term",
        evidence: [expect.stringContaining("easy to use")],
      }),
    ]);
  });

  it("flags missing actor, action, and outcome as deterministic testability diagnostics", () => {
    const findings = evaluateRequirementQuality(
      [
        requirement({
          title: "Support portal",
          content: "A better portal.",
        }),
      ],
      { language: "en" },
    );

    const testability = findings.find(
      (finding) => finding.kind === "missing-testability-signal",
    );

    expect(testability?.detail).toBe(
      "The requirement is missing actor, action, outcome.",
    );
    expect(
      testability?.diagnostics.map((diagnostic) => diagnostic.code),
    ).toEqual([
      "quality.testability.missing-actor",
      "quality.testability.missing-action",
      "quality.testability.missing-outcome",
    ]);
  });

  it("detects deterministic conflicts between related requirements", () => {
    const findings = evaluateRequirementQuality(
      [
        requirement({
          id: "artifact-requirement-001",
          title: "Show contact details",
          content: "The dashboard should show customer contact details.",
        }),
        requirement({
          id: "artifact-requirement-002",
          title: "Hide contact details",
          content:
            "The dashboard must not show customer contact details to support staff.",
        }),
      ],
      { language: "en", focusArtifactIds: ["artifact-requirement-002"] },
    );

    const conflict = findings.find((finding) => finding.kind === "conflict");

    expect(conflict?.severity).toBe("blocker");
    expect(conflict?.artifactId).toBe("artifact-requirement-002");
    expect(conflict?.relatedArtifactIds).toEqual(["artifact-requirement-001"]);
    expect(conflict?.diagnostics[0]?.code).toBe("quality.conflict.visibility");
  });

  it("surfaces likely duplicate requirements for human review", () => {
    const findings = evaluateRequirementQuality(
      [
        requirement({
          id: "artifact-requirement-001",
          title: "Send case notification",
          content:
            "The support team should send a case notification to the customer when the case is updated.",
        }),
        requirement({
          id: "artifact-requirement-002",
          title: "Send customer case notification",
          content:
            "The support team should send a customer case notification when the case is updated.",
        }),
      ],
      { language: "en", focusArtifactIds: ["artifact-requirement-002"] },
    );

    const duplicate = findings.find((finding) => finding.kind === "duplicate");

    expect(duplicate?.severity).toBe("warning");
    expect(duplicate?.artifactId).toBe("artifact-requirement-002");
    expect(duplicate?.relatedArtifactIds).toEqual(["artifact-requirement-001"]);
    expect(duplicate?.diagnostics[0]?.code).toBe(
      "quality.duplicate.high-overlap",
    );
  });

  it("checks accepted requirements and ignores rejected requirements", () => {
    const findings = evaluateRequirementQuality(
      [
        requirement({
          id: "artifact-requirement-accepted",
          status: "accepted",
          content: "The workflow should be simple.",
        }),
        requirement({
          id: "artifact-requirement-rejected",
          status: "rejected",
          content: "The workflow should be simple.",
        }),
      ],
      { language: "en" },
    );

    expect(
      findings.some(
        (finding) => finding.artifactId === "artifact-requirement-accepted",
      ),
    ).toBe(true);
    expect(
      findings.some(
        (finding) => finding.artifactId === "artifact-requirement-rejected",
      ),
    ).toBe(false);
  });

  it("does not treat a lone when clause as acceptance criteria", () => {
    const findings = evaluateRequirementQuality(
      [
        requirement({
          content:
            "The support team should view the case status when a customer calls so that they can answer quickly.",
        }),
      ],
      { language: "en" },
    );

    expect(findings.map((finding) => finding.kind)).toContain(
      "missing-acceptance-criteria",
    );
  });

  it("does not flag acceptance or non-functional gaps when evidence is present", () => {
    const findings = evaluateRequirementQuality(
      [
        requirement({
          content:
            "The dashboard should load within 2 seconds. Acceptance criteria: Given an operator opens the overview, then current alarm status is shown. Security logging records access.",
          tags: ["acceptance"],
        }),
      ],
      { language: "en" },
    );

    expect(findings.map((finding) => finding.kind)).not.toContain(
      "missing-acceptance-criteria",
    );
    expect(findings.map((finding) => finding.kind)).not.toContain(
      "missing-non-functional-concern",
    );
  });

  it("produces Swedish quality questions when requested", () => {
    const findings = evaluateRequirementQuality(
      [
        requirement({
          content:
            "Systemet ska vara enkelt att använda och förbättra arbetet.",
        }),
      ],
      { language: "sv" },
    );

    const draft = requirementQualityQuestionDraft(findings[0]!);

    expect(draft.type).toBe("question");
    expect(findings.map((finding) => finding.question).join(" ")).toContain(
      "Vilket acceptanskriterium",
    );
  });
});

function requirement(
  overrides: Partial<WorkshopArtifact> = {},
): WorkshopArtifact {
  return {
    id: "artifact-requirement-001",
    type: "requirement",
    title: "Requirement candidate",
    content: "The system should support the workflow.",
    status: "draft",
    createdBy: "agent-quality",
    updatedAt: "2026-07-01T10:00:00.000Z",
    source: {
      messageId: "message-001",
      participantId: "agent-quality",
    },
    tags: [],
    ...overrides,
  };
}
