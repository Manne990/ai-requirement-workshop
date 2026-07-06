import {
  assessSensitiveText,
  mergeSensitiveFindings,
  type SensitiveFinding,
} from "./security";
import { buildTraceabilityGraph } from "./traceability";
import type {
  Requirement,
  RequirementHistoryAction,
  RequirementHistoryEntry,
} from "./requirements";
import type { ProductionAttachmentRecord } from "./attachmentSecurity";
import type {
  ArtifactStatus,
  WorkshopArtifact,
  WorkshopSession,
} from "./workshop";

export type AuditEventCategory =
  "access" | "ai" | "attachment" | "export" | "requirement" | "workshop";

export type AuditEventAction =
  | "access.denied"
  | "ai.prompt-built"
  | "attachment.reviewed"
  | "export.generated"
  | `requirement.${RequirementHistoryAction}`
  | "workshop.status-updated";

export type AuditEventTargetType =
  "ai-request" | "attachment" | "export" | "requirement" | "workshop";

export type AuditEventTarget = {
  type: AuditEventTargetType;
  id: string;
};

export type AuditEvent = {
  id: string;
  version: 1;
  organizationId: string;
  workshopId: string;
  actorId: string;
  at: string;
  category: AuditEventCategory;
  action: AuditEventAction;
  target: AuditEventTarget;
  summary: string;
  metadata: Record<string, unknown>;
};

export type CreateAuditEventInput = Omit<AuditEvent, "id" | "version"> & {
  id?: string;
  sequence: number;
};

export type AuditSummary = {
  eventCount: number;
  latestEventAt?: string;
  byCategory: {
    category: AuditEventCategory;
    count: number;
  }[];
  byAction: {
    action: AuditEventAction;
    count: number;
  }[];
};

export type AuditContext = {
  organizationId: string;
  workshopId: string;
  sequenceStart?: number;
};

export type ProductionWorkshopExport = {
  schema_version: 1;
  kind: "AI_REQUIREMENT_WORKSHOP_PRODUCTION_EXPORT";
  generatedAt: string;
  provenance: ProductionWorkshopExportProvenance;
  organizationId: string;
  workshopId: string;
  report: {
    approvedRequirements: {
      id: string;
      title: string;
      statement: string;
      state: Requirement["state"];
      version: number;
      sourceRefs: Requirement["sourceRefs"];
      provenance: {
        sourceRefs: Requirement["sourceRefs"];
        historyEntryIds: string[];
        auditEventIds: string[];
      };
      history: ExportedRequirementHistoryEntry[];
    }[];
    decisions: ExportedArtifact[];
    risks: ExportedArtifact[];
    openQuestions: ExportedArtifact[];
    attachments: {
      id: string;
      name: string;
      mimeType: string;
      size: number;
      status: string;
      summary: string;
      sourceMessageId: string;
      tags: string[];
    }[];
    traceability: {
      nodeCount: number;
      linkCount: number;
      warnings: string[];
    };
    auditEvidence: {
      requirementHistory: RequirementHistoryAuditEvidence[];
      warnings: string[];
    };
    auditSummary: AuditSummary;
    redactions: SensitiveFinding[];
  };
};

export type ProductionWorkshopExportProvenance = {
  source: "saved-workshop-state";
  generator: "createProductionWorkshopExport";
  generatedAt: string;
  organizationId: string;
  workshopId: string;
  workshopUpdatedAt: string;
  input: {
    requirementCount: number;
    approvedRequirementCount: number;
    auditEventCount: number;
    artifactCount: number;
    attachmentCount: number;
    prototypeCount: number;
    prototypeVersionCount: number;
  };
};

export type ExportedRequirementHistoryEntry = RequirementHistoryEntry & {
  auditEventId?: string;
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

type ExportedArtifact = {
  id: string;
  title: string;
  content: string;
  status: ArtifactStatus;
  source: WorkshopArtifact["source"];
  tags: string[];
};

export function createAuditEvent(input: CreateAuditEventInput): AuditEvent {
  return {
    id: input.id ?? createAuditEventId(input.workshopId, input.sequence),
    version: 1,
    organizationId: input.organizationId,
    workshopId: input.workshopId,
    actorId: input.actorId,
    at: input.at,
    category: input.category,
    action: input.action,
    target: input.target,
    summary: input.summary,
    metadata: input.metadata,
  };
}

export function auditRequirementHistory(
  requirement: Requirement,
  context: AuditContext,
): AuditEvent[] {
  const sequenceStart = context.sequenceStart ?? 1;

  return requirement.history.map((entry, index) =>
    createAuditEvent({
      sequence: sequenceStart + index,
      organizationId: context.organizationId,
      workshopId: context.workshopId,
      actorId: entry.actorId,
      at: entry.at,
      category: "requirement",
      action: `requirement.${entry.action}`,
      target: {
        type: "requirement",
        id: requirement.id,
      },
      summary: `Requirement ${requirement.id} ${entry.action}.`,
      metadata: {
        requirementId: requirement.id,
        historyEntryId: entry.id,
        historyIndex: index,
        title: requirement.title,
        fromState: entry.fromState,
        toState: entry.toState,
        version: entry.version,
        previousVersion: entry.version > 1 ? entry.version - 1 : undefined,
        rationale: entry.rationale,
        changes: entry.changes,
        changeFields: entry.changes.map((change) => change.field),
        sourceRefs: requirement.sourceRefs,
      },
    }),
  );
}

export function auditAttachmentSecurityReview(
  attachment: ProductionAttachmentRecord,
  context: AuditContext & { actorId?: string; sequence?: number },
): AuditEvent {
  return createAuditEvent({
    sequence: context.sequence ?? context.sequenceStart ?? 1,
    organizationId: context.organizationId,
    workshopId: context.workshopId,
    actorId: context.actorId ?? attachment.uploadedByUserId,
    at: attachment.securityReview.reviewedAt ?? attachment.createdAt,
    category: "attachment",
    action: "attachment.reviewed",
    target: {
      type: "attachment",
      id: attachment.id,
    },
    summary: `Attachment ${attachment.id} security review: ${attachment.securityReview.status}.`,
    metadata: {
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      sourceMessageId: attachment.sourceMessageId,
      scanStatus: attachment.securityReview.status,
      redactions: attachment.securityReview.redactions,
      storageProvider: attachment.storage.provider,
      objectPath: attachment.storage.objectPath,
    },
  });
}

export function createAuditSummary(events: AuditEvent[]): AuditSummary {
  return {
    eventCount: events.length,
    latestEventAt: events
      .map((event) => event.at)
      .sort((left, right) => right.localeCompare(left))[0],
    byCategory: countByCategory(events),
    byAction: countByAction(events),
  };
}

export function createProductionWorkshopExport(input: {
  session: WorkshopSession;
  requirements: Requirement[];
  auditEvents: AuditEvent[];
  organizationId: string;
  workshopId: string;
  generatedAt: string;
}): ProductionWorkshopExport {
  const findings: SensitiveFinding[] = [];
  const safeText = (text: string) => {
    const assessment = assessSensitiveText(text);
    findings.push(...assessment.findings);
    return assessment.redactedText;
  };
  const graph = buildTraceabilityGraph(input.session);
  const approvedRequirements = input.requirements.filter(
    (requirement) =>
      requirement.state === "approved" || requirement.state === "baselined",
  );
  const historyEvidence = buildRequirementHistoryAuditEvidence(
    approvedRequirements,
    input.auditEvents,
  );

  return {
    schema_version: 1,
    kind: "AI_REQUIREMENT_WORKSHOP_PRODUCTION_EXPORT",
    generatedAt: input.generatedAt,
    provenance: createExportProvenance({
      session: input.session,
      requirements: input.requirements,
      approvedRequirementCount: approvedRequirements.length,
      auditEvents: input.auditEvents,
      organizationId: input.organizationId,
      workshopId: input.workshopId,
      generatedAt: input.generatedAt,
    }),
    organizationId: input.organizationId,
    workshopId: input.workshopId,
    report: {
      approvedRequirements: approvedRequirements.map((requirement) => {
        const requirementEvidence = historyEvidence.requirementHistory.filter(
          (evidence) => evidence.requirementId === requirement.id,
        );

        return {
          id: requirement.id,
          title: safeText(requirement.title),
          statement: safeText(requirement.statement),
          state: requirement.state,
          version: requirement.version,
          sourceRefs: requirement.sourceRefs,
          provenance: {
            sourceRefs: requirement.sourceRefs,
            historyEntryIds: requirement.history.map((entry) => entry.id),
            auditEventIds: requirementEvidence
              .map((evidence) => evidence.auditEventId)
              .filter((id): id is string => typeof id === "string"),
          },
          history: requirement.history.map((entry) => ({
            ...entry,
            auditEventId: requirementEvidence.find(
              (evidence) => evidence.historyEntryId === entry.id,
            )?.auditEventId,
            rationale: safeText(entry.rationale),
            changes: entry.changes.map((change) => ({
              ...change,
              before: sanitizeUnknown(change.before, safeText),
              after: sanitizeUnknown(change.after, safeText),
            })),
          })),
        };
      }),
      decisions: exportArtifacts(input.session.artifacts, "decision", safeText),
      risks: exportArtifacts(input.session.artifacts, "risk", safeText),
      openQuestions: input.session.artifacts
        .filter(
          (artifact) =>
            artifact.type === "question" &&
            artifact.status !== "accepted" &&
            artifact.status !== "rejected",
        )
        .map((artifact) => exportArtifact(artifact, safeText)),
      attachments: (input.session.attachments ?? []).map((attachment) => ({
        id: attachment.id,
        name: safeText(attachment.name),
        mimeType: attachment.mimeType,
        size: attachment.size,
        status: attachment.status,
        summary: safeText(attachment.summary),
        sourceMessageId: attachment.sourceMessageId,
        tags: attachment.tags,
      })),
      traceability: {
        nodeCount: graph.nodes.length,
        linkCount: graph.links.length,
        warnings: graph.warnings,
      },
      auditEvidence: historyEvidence,
      auditSummary: createAuditSummary(input.auditEvents),
      redactions: mergeSensitiveFindings(findings),
    },
  };
}

function createExportProvenance(input: {
  session: WorkshopSession;
  requirements: Requirement[];
  approvedRequirementCount: number;
  auditEvents: AuditEvent[];
  organizationId: string;
  workshopId: string;
  generatedAt: string;
}): ProductionWorkshopExportProvenance {
  return {
    source: "saved-workshop-state",
    generator: "createProductionWorkshopExport",
    generatedAt: input.generatedAt,
    organizationId: input.organizationId,
    workshopId: input.workshopId,
    workshopUpdatedAt: input.session.updatedAt,
    input: {
      requirementCount: input.requirements.length,
      approvedRequirementCount: input.approvedRequirementCount,
      auditEventCount: input.auditEvents.length,
      artifactCount: input.session.artifacts.length,
      attachmentCount: input.session.attachments?.length ?? 0,
      prototypeCount: input.session.prototypes?.length ?? 0,
      prototypeVersionCount: (input.session.prototypes ?? []).reduce(
        (count, prototype) => count + prototype.versions.length,
        0,
      ),
    },
  };
}

function buildRequirementHistoryAuditEvidence(
  requirements: Requirement[],
  auditEvents: AuditEvent[],
) {
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
    requirementHistory,
    warnings: requirementHistory
      .filter((evidence) => !evidence.auditEventId)
      .map(
        (evidence) =>
          `Missing audit event for requirement ${evidence.requirementId} history ${evidence.historyEntryId}.`,
      ),
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

function countByCategory(events: AuditEvent[]) {
  const counts = new Map<AuditEventCategory, number>();

  for (const event of events) {
    counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => ({ category, count }));
}

function countByAction(events: AuditEvent[]) {
  const counts = new Map<AuditEventAction, number>();

  for (const event of events) {
    counts.set(event.action, (counts.get(event.action) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([action, count]) => ({ action, count }));
}

function createAuditEventId(workshopId: string, sequence: number) {
  return `${workshopId}:audit-${String(sequence).padStart(4, "0")}`;
}
