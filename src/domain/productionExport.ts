import {
  type AuditEvent,
  type AuditEventAction,
  createAuditSummary,
  type AuditSummary,
} from "./audit";
import type { Prototype, PrototypeVersion } from "./prototype";
import {
  evaluateRequirementQuality,
  type RequirementQualityFinding,
} from "./requirementQuality";
import type {
  Requirement,
  RequirementHistoryAction,
  RequirementHistoryEntry,
  RequirementState,
} from "./requirements";
import {
  assessSensitiveText,
  mergeSensitiveFindings,
  type SensitiveFinding,
} from "./security";
import {
  buildTraceabilityGraph,
  findTraceabilityCoverageGaps,
  type TraceabilityCoverageGap,
} from "./traceability";
import {
  generateWorkshopReport,
  type ArtifactStatus,
  type WorkshopArtifact,
  type WorkshopReport,
  type WorkshopReportSection,
  type WorkshopSession,
} from "./workshop";

export type ProductionReviewReadiness = "ready" | "needs-review" | "blocked";

export type ProductionExportPackage = {
  schema_version: 1;
  kind: "AI_REQUIREMENT_WORKSHOP_PRODUCTION_REVIEW_PACKAGE";
  generatedAt: string;
  organizationId: string;
  workshopId: string;
  readiness: ProductionReviewReadiness;
  provenance: ProductionExportProvenance;
  stakeholderReport: WorkshopReport;
  requirementRegister: ExportedRequirement[];
  audit: ProductionExportAuditMetadata;
  traceability: ProductionExportTraceabilityCoverage;
  requirementQuality: ProductionExportRequirementQuality;
  prototypeSummary: ProductionExportPrototypeSummary;
  appendix: ProductionExportAppendix;
  redactions: SensitiveFinding[];
};

export type ProductionExportProvenance = {
  source: "saved-workshop-state";
  generator: "createProductionExportPackage";
  generatedAt: string;
  workshopUpdatedAt: string;
  input: {
    messageCount: number;
    artifactCount: number;
    requirementCount: number;
    approvedRequirementCount: number;
    auditEventCount: number;
    attachmentCount: number;
    prototypeCount: number;
    prototypeVersionCount: number;
  };
};

export type ExportedRequirement = {
  id: string;
  title: string;
  statement: string;
  state: RequirementState;
  version: number;
  acceptanceCriteria: Requirement["acceptanceCriteria"];
  rationale: string;
  sourceRefs: Requirement["sourceRefs"];
  approval: {
    approvedAt?: string;
    approvedBy?: string;
    baselinedAt?: string;
    baselinedBy?: string;
  };
  history: ExportedRequirementHistoryEntry[];
  auditEventIds: string[];
};

export type ExportedRequirementHistoryEntry = RequirementHistoryEntry & {
  auditEventId?: string;
};

export type ProductionExportAuditMetadata = {
  summary: AuditSummary;
  requirementHistory: RequirementHistoryAuditEvidence[];
  missingEvidenceWarnings: string[];
  exportEventIds: string[];
};

export type RequirementHistoryAuditEvidence = {
  requirementId: string;
  requirementVersion: number;
  historyEntryId: string;
  action: RequirementHistoryAction;
  actorId: string;
  at: string;
  auditEventId?: string;
};

export type ProductionExportTraceabilityCoverage = {
  nodeCount: number;
  linkCount: number;
  coveredNodeCount: number;
  gapCount: number;
  coveragePercent: number;
  gaps: TraceabilityCoverageGap[];
  gapsByExpectation: {
    expectationId: string;
    count: number;
  }[];
  warnings: string[];
};

export type ProductionExportRequirementQuality = {
  findingCount: number;
  blockerCount: number;
  warningCount: number;
  findings: RequirementQualityFinding[];
  findingsByKind: {
    kind: RequirementQualityFinding["kind"];
    count: number;
  }[];
};

export type ProductionExportPrototypeSummary = {
  prototypeCount: number;
  currentVersionCount: number;
  coveredRequirementIds: string[];
  feedbackCount: number;
  prototypes: ExportedPrototypeSummary[];
};

export type ExportedPrototypeSummary = {
  id: string;
  title: string;
  status: Prototype["status"];
  currentVersion: number;
  updatedAt: string;
  current: {
    id: string;
    title: string;
    generatedAt: string;
    generatedBy: string;
    sourceModel: PrototypeVersion["sourceModel"];
    requirementCount: number;
    coveredRequirementCount: number;
    uncoveredRequirementIds: string[];
    elementCount: number;
    changeSummary: string;
  };
  feedbackCount: number;
};

export type ProductionExportAppendix = {
  decisions: ExportedArtifact[];
  risks: ExportedArtifact[];
  openQuestions: ExportedArtifact[];
  attachments: ExportedAttachment[];
};

export type ExportedArtifact = {
  id: string;
  title: string;
  content: string;
  status: ArtifactStatus;
  source: WorkshopArtifact["source"];
  tags: string[];
};

export type ExportedAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  status: string;
  summary: string;
  sourceMessageId: string;
  tags: string[];
};

export type CreateProductionExportPackageInput = {
  session: WorkshopSession;
  requirements?: Requirement[];
  auditEvents?: AuditEvent[];
  organizationId: string;
  workshopId?: string;
  generatedAt: string;
};

export function createProductionExportPackage(
  input: CreateProductionExportPackageInput,
): ProductionExportPackage {
  const requirements = input.requirements ?? [];
  const auditEvents = input.auditEvents ?? [];
  const workshopId = input.workshopId ?? input.session.id;
  const redactor = createPackageRedactor();
  const report = sanitizeWorkshopReport(
    generateWorkshopReport(input.session, input.generatedAt),
    redactor.safeText,
  );
  const traceability = buildTraceabilityCoverage(input.session);
  const requirementQuality = summarizeRequirementQuality(
    evaluateRequirementQuality(input.session.artifacts),
    redactor.safeText,
  );
  const audit = buildAuditMetadata(requirements, auditEvents);
  const requirementRegister = requirements
    .filter(
      (requirement) =>
        requirement.state === "approved" || requirement.state === "baselined",
    )
    .map((requirement) =>
      exportRequirement(
        requirement,
        audit.requirementHistory,
        redactor.safeText,
      ),
    );
  const prototypeSummary = buildPrototypeSummary(
    input.session.prototypes ?? [],
    redactor.safeText,
  );

  return {
    schema_version: 1,
    kind: "AI_REQUIREMENT_WORKSHOP_PRODUCTION_REVIEW_PACKAGE",
    generatedAt: input.generatedAt,
    organizationId: input.organizationId,
    workshopId,
    readiness: determineReadiness({
      audit,
      traceability,
      requirementQuality,
      requirementRegister,
    }),
    provenance: {
      source: "saved-workshop-state",
      generator: "createProductionExportPackage",
      generatedAt: input.generatedAt,
      workshopUpdatedAt: input.session.updatedAt,
      input: {
        messageCount: input.session.messages.length,
        artifactCount: input.session.artifacts.length,
        requirementCount: requirements.length,
        approvedRequirementCount: requirementRegister.length,
        auditEventCount: auditEvents.length,
        attachmentCount: input.session.attachments?.length ?? 0,
        prototypeCount: input.session.prototypes?.length ?? 0,
        prototypeVersionCount: (input.session.prototypes ?? []).reduce(
          (count, prototype) => count + prototype.versions.length,
          0,
        ),
      },
    },
    stakeholderReport: report,
    requirementRegister,
    audit,
    traceability,
    requirementQuality,
    prototypeSummary,
    appendix: {
      decisions: exportArtifacts(
        input.session.artifacts,
        "decision",
        redactor.safeText,
      ),
      risks: exportArtifacts(
        input.session.artifacts,
        "risk",
        redactor.safeText,
      ),
      openQuestions: input.session.artifacts
        .filter(
          (artifact) =>
            artifact.type === "question" &&
            artifact.status !== "accepted" &&
            artifact.status !== "rejected",
        )
        .map((artifact) => exportArtifact(artifact, redactor.safeText)),
      attachments: (input.session.attachments ?? []).map((attachment) => ({
        id: attachment.id,
        name: redactor.safeText(attachment.name),
        mimeType: attachment.mimeType,
        size: attachment.size,
        status: attachment.status,
        summary: redactor.safeText(attachment.summary),
        sourceMessageId: attachment.sourceMessageId,
        tags: attachment.tags,
      })),
    },
    redactions: redactor.findings(),
  };
}

function sanitizeWorkshopReport(
  report: WorkshopReport,
  safeText: (text: string) => string,
): WorkshopReport {
  return {
    title: safeText(report.title),
    generatedAt: report.generatedAt,
    sections: report.sections.map((section) =>
      sanitizeReportSection(section, safeText),
    ),
    unresolved: report.unresolved.map((artifact) =>
      sanitizeArtifact(artifact, safeText),
    ),
  };
}

function sanitizeReportSection(
  section: WorkshopReportSection,
  safeText: (text: string) => string,
): WorkshopReportSection {
  return {
    id: section.id,
    title: safeText(section.title),
    items: section.items.map((item) => ({
      artifactId: item.artifactId,
      title: safeText(item.title),
      content: safeText(item.content),
      source: item.source,
    })),
  };
}

function sanitizeArtifact(
  artifact: WorkshopArtifact,
  safeText: (text: string) => string,
): WorkshopArtifact {
  return {
    ...artifact,
    title: safeText(artifact.title),
    content: safeText(artifact.content),
  };
}

function buildTraceabilityCoverage(
  session: WorkshopSession,
): ProductionExportTraceabilityCoverage {
  const graph = buildTraceabilityGraph(session);
  const gaps = findTraceabilityCoverageGaps(graph);
  const coveredNodeIds = new Set(
    graph.nodes
      .filter(
        (node) =>
          node.kind !== "source-message" && node.kind !== "source-attachment",
      )
      .map((node) => node.id),
  );

  for (const gap of gaps) {
    coveredNodeIds.delete(gap.targetNodeId);
  }

  const coveredNodeCount = coveredNodeIds.size;
  const assessedNodeCount = coveredNodeCount + gaps.length;

  return {
    nodeCount: graph.nodes.length,
    linkCount: graph.links.length,
    coveredNodeCount,
    gapCount: gaps.length,
    coveragePercent:
      assessedNodeCount === 0
        ? 100
        : Math.round((coveredNodeCount / assessedNodeCount) * 100),
    gaps,
    gapsByExpectation: countBy(gaps, (gap) => gap.expectationId).map(
      ([expectationId, count]) => ({ expectationId, count }),
    ),
    warnings: graph.warnings,
  };
}

function summarizeRequirementQuality(
  findings: RequirementQualityFinding[],
  safeText: (text: string) => string,
): ProductionExportRequirementQuality {
  const sanitizedFindings = findings.map((finding) => ({
    ...finding,
    title: safeText(finding.title),
    detail: safeText(finding.detail),
    question: safeText(finding.question),
    diagnostics: finding.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      message: safeText(diagnostic.message),
      evidence: diagnostic.evidence.map(safeText),
      suggestion: safeText(diagnostic.suggestion),
    })),
  }));

  return {
    findingCount: sanitizedFindings.length,
    blockerCount: sanitizedFindings.filter(
      (finding) => finding.severity === "blocker",
    ).length,
    warningCount: sanitizedFindings.filter(
      (finding) => finding.severity === "warning",
    ).length,
    findings: sanitizedFindings,
    findingsByKind: countBy(sanitizedFindings, (finding) => finding.kind).map(
      ([kind, count]) => ({ kind, count }),
    ),
  };
}

function buildAuditMetadata(
  requirements: Requirement[],
  auditEvents: AuditEvent[],
): ProductionExportAuditMetadata {
  const requirementHistory = requirements.flatMap((requirement) =>
    requirement.history.map((entry) => {
      const auditEvent = findRequirementHistoryAuditEvent(
        auditEvents,
        requirement,
        entry,
      );

      return {
        requirementId: requirement.id,
        requirementVersion: entry.version,
        historyEntryId: entry.id,
        action: entry.action,
        actorId: entry.actorId,
        at: entry.at,
        auditEventId: auditEvent?.id,
      };
    }),
  );

  return {
    summary: createAuditSummary(auditEvents),
    requirementHistory,
    missingEvidenceWarnings: requirementHistory
      .filter((evidence) => !evidence.auditEventId)
      .map(
        (evidence) =>
          `Missing audit event for requirement ${evidence.requirementId} history ${evidence.historyEntryId}.`,
      ),
    exportEventIds: auditEvents
      .filter((event) => event.action === "export.generated")
      .map((event) => event.id),
  };
}

function exportRequirement(
  requirement: Requirement,
  evidence: RequirementHistoryAuditEvidence[],
  safeText: (text: string) => string,
): ExportedRequirement {
  const requirementEvidence = evidence.filter(
    (entry) => entry.requirementId === requirement.id,
  );

  return {
    id: requirement.id,
    title: safeText(requirement.title),
    statement: safeText(requirement.statement),
    state: requirement.state,
    version: requirement.version,
    acceptanceCriteria: requirement.acceptanceCriteria.map((criterion) => ({
      id: criterion.id,
      text: safeText(criterion.text),
    })),
    rationale: safeText(requirement.rationale),
    sourceRefs: requirement.sourceRefs,
    approval: {
      approvedAt: requirement.approvedAt,
      approvedBy: requirement.approvedBy,
      baselinedAt: requirement.baselinedAt,
      baselinedBy: requirement.baselinedBy,
    },
    history: requirement.history.map((entry) => ({
      ...entry,
      rationale: safeText(entry.rationale),
      changes: entry.changes.map((change) => ({
        ...change,
        before: sanitizeUnknown(change.before, safeText),
        after: sanitizeUnknown(change.after, safeText),
      })),
      auditEventId: requirementEvidence.find(
        (candidate) => candidate.historyEntryId === entry.id,
      )?.auditEventId,
    })),
    auditEventIds: requirementEvidence
      .map((entry) => entry.auditEventId)
      .filter((id): id is string => typeof id === "string"),
  };
}

function buildPrototypeSummary(
  prototypes: Prototype[],
  safeText: (text: string) => string,
): ProductionExportPrototypeSummary {
  const allCoveredRequirementIds: string[] = [];
  const summaries = prototypes.flatMap((prototype) => {
    const current = prototype.versions.find(
      (version) => version.version === prototype.currentVersion,
    );

    if (!current) {
      return [];
    }

    const uncoveredRequirementIds = current.coverage
      .filter((coverage) => coverage.status === "not-covered")
      .map((coverage) => coverage.requirementId);
    const coveredRequirementIds = current.coverage
      .filter((coverage) => coverage.status === "covered")
      .map((coverage) => coverage.requirementId);
    allCoveredRequirementIds.push(...coveredRequirementIds);

    return [
      {
        id: prototype.id,
        title: safeText(prototype.title),
        status: prototype.status,
        currentVersion: prototype.currentVersion,
        updatedAt: prototype.updatedAt,
        current: {
          id: current.id,
          title: safeText(current.title),
          generatedAt: current.generatedAt,
          generatedBy: current.generatedBy,
          sourceModel: current.sourceModel,
          requirementCount: current.requirementRefs.length,
          coveredRequirementCount: coveredRequirementIds.length,
          uncoveredRequirementIds,
          elementCount: current.elements.length,
          changeSummary: safeText(current.changeSummary),
        },
        feedbackCount: prototype.feedback.length,
      },
    ];
  });

  return {
    prototypeCount: prototypes.length,
    currentVersionCount: summaries.length,
    coveredRequirementIds: uniqueSorted(allCoveredRequirementIds),
    feedbackCount: prototypes.reduce(
      (count, prototype) => count + prototype.feedback.length,
      0,
    ),
    prototypes: summaries,
  };
}

function determineReadiness(input: {
  audit: ProductionExportAuditMetadata;
  traceability: ProductionExportTraceabilityCoverage;
  requirementQuality: ProductionExportRequirementQuality;
  requirementRegister: ExportedRequirement[];
}): ProductionReviewReadiness {
  if (
    input.requirementRegister.length === 0 ||
    input.audit.missingEvidenceWarnings.length > 0 ||
    input.requirementQuality.blockerCount > 0
  ) {
    return "blocked";
  }

  if (
    input.traceability.gapCount > 0 ||
    input.traceability.warnings.length > 0 ||
    input.requirementQuality.warningCount > 0
  ) {
    return "needs-review";
  }

  return "ready";
}

function exportArtifacts(
  artifacts: WorkshopArtifact[],
  type: WorkshopArtifact["type"],
  safeText: (text: string) => string,
) {
  return artifacts
    .filter((artifact) => artifact.type === type)
    .map((artifact) => exportArtifact(artifact, safeText));
}

function exportArtifact(
  artifact: WorkshopArtifact,
  safeText: (text: string) => string,
): ExportedArtifact {
  return {
    id: artifact.id,
    title: safeText(artifact.title),
    content: safeText(artifact.content),
    status: artifact.status,
    source: artifact.source,
    tags: artifact.tags,
  };
}

function findRequirementHistoryAuditEvent(
  auditEvents: AuditEvent[],
  requirement: Requirement,
  entry: RequirementHistoryEntry,
) {
  const action: AuditEventAction = `requirement.${entry.action}`;

  return auditEvents.find(
    (event) =>
      event.target.type === "requirement" &&
      event.target.id === requirement.id &&
      event.action === action &&
      event.actorId === entry.actorId &&
      event.at === entry.at &&
      (event.metadata.historyEntryId === entry.id ||
        (event.metadata.version === entry.version &&
          !event.metadata.historyEntryId)),
  );
}

function createPackageRedactor() {
  const findings: SensitiveFinding[] = [];

  return {
    safeText(text: string) {
      const assessment = assessSensitiveText(text);
      findings.push(...assessment.findings);
      return assessment.redactedText;
    },
    findings() {
      return mergeSensitiveFindings(findings);
    },
  };
}

function sanitizeUnknown(
  value: unknown,
  safeText: (text: string) => string,
): unknown {
  if (typeof value === "string") {
    return safeText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item, safeText));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeUnknown(item, safeText),
      ]),
    );
  }

  return value;
}

function countBy<T, K extends string>(
  items: T[],
  keyForItem: (item: T) => K,
): [K, number][] {
  const counts = new Map<K, number>();

  for (const item of items) {
    const key = keyForItem(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
