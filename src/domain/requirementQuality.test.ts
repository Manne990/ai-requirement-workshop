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
