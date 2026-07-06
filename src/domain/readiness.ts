import { evaluateRequirementQuality } from "./requirementQuality";
import type { ArtifactType, WorkshopSession } from "./workshop";

export type ReadinessLevel = "early" | "shaping" | "ready";

export type ReadinessCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type WorkshopReadiness = {
  score: number;
  level: ReadinessLevel;
  summary: string;
  blockers: string[];
  checks: ReadinessCheck[];
};

export function evaluateWorkshopReadiness(
  session: WorkshopSession,
): WorkshopReadiness {
  const checks: ReadinessCheck[] = [
    checkAcceptedOrDraft(session, "problem", "Problem framed"),
    checkAcceptedOrDraft(session, "actor", "Primary actors identified"),
    checkAcceptedCount(session, "requirement", 2, "Accepted requirements"),
    checkRisksHandled(session),
    checkOpenQuestions(session),
    checkTraceableReportMaterial(session),
    checkRequirementQuality(session),
  ];

  const score = Math.round(
    (checks.filter((check) => check.passed).length / checks.length) * 100,
  );
  const blockers = checks
    .filter((check) => !check.passed)
    .map((check) => check.detail);
  const level: ReadinessLevel =
    score >= 84 ? "ready" : score >= 50 ? "shaping" : "early";

  return {
    score,
    level,
    summary: readinessSummary(level, score, blockers.length),
    blockers,
    checks,
  };
}

function checkAcceptedOrDraft(
  session: WorkshopSession,
  type: ArtifactType,
  label: string,
): ReadinessCheck {
  const accepted = session.artifacts.filter(
    (artifact) => artifact.type === type && artifact.status === "accepted",
  ).length;
  const drafts = session.artifacts.filter(
    (artifact) => artifact.type === type && artifact.status === "draft",
  ).length;
  const passed = accepted > 0;

  return {
    id: type,
    label,
    passed,
    detail: passed
      ? `${accepted} accepted ${type} artifact${accepted === 1 ? "" : "s"}.`
      : drafts > 0
        ? `${label} exists but is still draft.`
        : `${label} is missing.`,
  };
}

function checkAcceptedCount(
  session: WorkshopSession,
  type: ArtifactType,
  expected: number,
  label: string,
): ReadinessCheck {
  const accepted = session.artifacts.filter(
    (artifact) => artifact.type === type && artifact.status === "accepted",
  ).length;

  return {
    id: `${type}-count`,
    label,
    passed: accepted >= expected,
    detail:
      accepted >= expected
        ? `${accepted} accepted ${type} artifacts.`
        : `Accept at least ${expected} ${type} artifacts; ${accepted} accepted so far.`,
  };
}

function checkRisksHandled(session: WorkshopSession): ReadinessCheck {
  const openRisks = session.artifacts.filter(
    (artifact) =>
      (artifact.type === "risk" || artifact.type === "assumption") &&
      artifact.status === "draft",
  ).length;
  const handledRisks = session.artifacts.filter(
    (artifact) =>
      (artifact.type === "risk" || artifact.type === "assumption") &&
      (artifact.status === "accepted" || artifact.status === "parked"),
  ).length;

  return {
    id: "risk-handling",
    label: "Risks and assumptions handled",
    passed: openRisks === 0 && handledRisks > 0,
    detail:
      openRisks === 0 && handledRisks > 0
        ? `${handledRisks} risks or assumptions accepted or parked.`
        : openRisks > 0
          ? `${openRisks} risks or assumptions are still draft.`
          : "No risks or assumptions have been captured yet.",
  };
}

function checkOpenQuestions(session: WorkshopSession): ReadinessCheck {
  const openQuestions = session.artifacts.filter(
    (artifact) => artifact.type === "question" && artifact.status === "draft",
  ).length;

  return {
    id: "open-questions",
    label: "Open questions visible",
    passed: openQuestions <= 2,
    detail:
      openQuestions <= 2
        ? `${openQuestions} open draft question${openQuestions === 1 ? "" : "s"}.`
        : `${openQuestions} open draft questions should be answered, accepted, parked, or rejected.`,
  };
}

function checkTraceableReportMaterial(
  session: WorkshopSession,
): ReadinessCheck {
  const accepted = session.artifacts.filter(
    (artifact) => artifact.status === "accepted",
  );
  const traceable = accepted.every(
    (artifact) => artifact.source.messageId || artifact.source.artifactId,
  );

  return {
    id: "traceability",
    label: "Traceable report material",
    passed: accepted.length > 0 && traceable,
    detail:
      accepted.length > 0 && traceable
        ? `${accepted.length} accepted artifacts have source references.`
        : accepted.length === 0
          ? "Accept at least one artifact before report readiness can be assessed."
          : "Some accepted artifacts lack source references.",
  };
}

function checkRequirementQuality(session: WorkshopSession): ReadinessCheck {
  const findings = evaluateRequirementQuality(session.artifacts);
  const blockers = findings.filter((finding) => finding.severity === "blocker");
  const requirementCount = session.artifacts.filter(
    (artifact) => artifact.type === "requirement",
  ).length;

  return {
    id: "requirement-quality",
    label: "Requirement quality checked",
    passed: requirementCount > 0 && blockers.length === 0,
    detail:
      requirementCount === 0
        ? "No requirements have been captured for quality review."
        : blockers.length === 0
          ? `${findings.length} quality suggestion${findings.length === 1 ? "" : "s"} visible; no blockers.`
          : `${blockers.length} blocking requirement quality issue${blockers.length === 1 ? "" : "s"} need review.`,
  };
}

function readinessSummary(
  level: ReadinessLevel,
  score: number,
  blockerCount: number,
) {
  if (level === "ready") {
    return `Ready for a first report (${score}%).`;
  }

  if (level === "shaping") {
    return `Still shaping the workshop (${score}%, ${blockerCount} gaps).`;
  }

  return `Early exploration (${score}%, ${blockerCount} gaps).`;
}
