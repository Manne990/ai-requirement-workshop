import {
  applyArtifactConsolidationSuggestion,
  suggestArtifactConsolidations,
  type ApplyArtifactConsolidationOptions,
  type ArtifactConsolidationSuggestion,
  type ConsolidationSuggestionOptions,
} from "./artifactConsolidation";
import {
  auditRequirementHistory,
  createAuditEvent,
  type AuditEvent,
} from "./audit";
import {
  approveRequirement,
  baselineRequirement,
  createRequirementCandidateFromArtifact,
  promoteRequirementToCandidate,
  rejectRequirement,
  reopenRequirement,
  selectRequirementPanelItems,
  type Requirement,
  type RequirementPanelItem,
} from "./requirements";
import {
  participantIds,
  type ArtifactStatus,
  type WorkshopArtifact,
  type WorkshopSession,
} from "./workshop";

export type RuntimeConsolidationSuggestionState =
  "pending" | "applied" | "parked";

export type RuntimeConsolidationRequirementDraft = {
  id?: string;
  title: string;
  sourceArtifactIds?: string[];
};

export type RuntimeConsolidationSuggestion = {
  id: string;
  kind: "merge" | "split";
  title: string;
  rationale?: string;
  sourceArtifactIds: string[];
  proposedRequirements: RuntimeConsolidationRequirementDraft[];
  state?: RuntimeConsolidationSuggestionState;
};

export type RequirementRuntimeActionOptions = {
  actorId?: string;
  at?: string;
  rationale?: string;
};

export type RequirementRuntimeLedger = {
  requirements: Requirement[];
  auditEvents: AuditEvent[];
};

export type RequirementRuntimeAuditContext = {
  organizationId: string;
  workshopId: string;
};

export type RequirementRuntimeAuditedAction =
  "approved" | "rejected" | "baselined" | "superseded";

export type RuntimeConsolidationActionOptions =
  ApplyArtifactConsolidationOptions;

export type RuntimeConsolidationDecision = "applied" | "parked";

export type RuntimeConsolidationDecisionOptions =
  RequirementRuntimeActionOptions & {
    outputRequirementIds?: string[];
  };

export type RuntimeConsolidationApplyResult = {
  session: WorkshopSession;
  ledger: RequirementRuntimeLedger;
  createdRequirementIds: string[];
  updatedRequirementIds: string[];
};

const lifecycleTagAliases = {
  approved: ["approved"],
  rejected: ["rejected"],
  baseline: ["baseline", "baselined"],
  superseded: ["supersede", "superseded"],
} as const;

const now = () => new Date().toISOString();

export function selectRequirementPanelItemsFromSession(
  session: WorkshopSession,
): RequirementPanelItem[] {
  return selectRequirementPanelItems(session.artifacts);
}

export function selectConsolidationPanelArtifacts(
  session: WorkshopSession,
): Pick<WorkshopArtifact, "id" | "type" | "title" | "content" | "status">[] {
  return session.artifacts.map(({ id, type, title, content, status }) => ({
    id,
    type,
    title,
    content,
    status,
  }));
}

export function selectConsolidationPanelSuggestionsFromSession(
  session: WorkshopSession,
  options: ConsolidationSuggestionOptions = {},
): RuntimeConsolidationSuggestion[] {
  return suggestArtifactConsolidations(session.artifacts, options).map(
    (suggestion) => toRuntimeConsolidationSuggestion(session, suggestion),
  );
}

export function approveRequirementPanelItem(
  session: WorkshopSession,
  requirement: RequirementPanelItem | string,
  options: RequirementRuntimeActionOptions = {},
): WorkshopSession {
  return updateRequirementArtifactLifecycle(
    session,
    requirementIdOf(requirement),
    "accepted",
    lifecycleTagAliases.approved,
    [
      ...lifecycleTagAliases.rejected,
      ...lifecycleTagAliases.baseline,
      ...lifecycleTagAliases.superseded,
    ],
    options,
  );
}

export function rejectRequirementPanelItem(
  session: WorkshopSession,
  requirement: RequirementPanelItem | string,
  options: RequirementRuntimeActionOptions = {},
): WorkshopSession {
  return updateRequirementArtifactLifecycle(
    session,
    requirementIdOf(requirement),
    "rejected",
    lifecycleTagAliases.rejected,
    [
      ...lifecycleTagAliases.approved,
      ...lifecycleTagAliases.baseline,
      ...lifecycleTagAliases.superseded,
    ],
    options,
  );
}

export function baselineRequirementPanelItem(
  session: WorkshopSession,
  requirement: RequirementPanelItem | string,
  options: RequirementRuntimeActionOptions = {},
): WorkshopSession {
  const requirementId = requirementIdOf(requirement);
  const panelItem = selectRequirementPanelItemsFromSession(session).find(
    (candidate) => candidate.id === requirementId,
  );

  if (!panelItem) {
    throw new Error(
      `Requirement artifact ${requirementId} could not be found.`,
    );
  }
  if (panelItem.status !== "approved" && panelItem.status !== "baselined") {
    throw new Error("Only approved requirements can be baselined.");
  }

  return updateRequirementArtifactLifecycle(
    session,
    requirementId,
    "accepted",
    lifecycleTagAliases.baseline,
    [...lifecycleTagAliases.rejected, ...lifecycleTagAliases.superseded],
    options,
  );
}

export function supersedeRequirementPanelItem(
  session: WorkshopSession,
  requirement: RequirementPanelItem | string,
  options: RequirementRuntimeActionOptions = {},
): WorkshopSession {
  return updateRequirementArtifactLifecycle(
    session,
    requirementIdOf(requirement),
    "parked",
    lifecycleTagAliases.superseded,
    [
      ...lifecycleTagAliases.approved,
      ...lifecycleTagAliases.rejected,
      ...lifecycleTagAliases.baseline,
    ],
    options,
  );
}

export function recordRequirementPanelLedgerAction(
  session: WorkshopSession,
  ledger: RequirementRuntimeLedger,
  requirement: RequirementPanelItem | string,
  action: RequirementRuntimeAuditedAction,
  context: RequirementRuntimeAuditContext,
  options: RequirementRuntimeActionOptions = {},
): RequirementRuntimeLedger {
  const requirementId = requirementIdOf(requirement);
  const artifact = session.artifacts.find(
    (candidate) =>
      candidate.id === requirementId && candidate.type === "requirement",
  );

  if (!artifact) {
    return ledger;
  }

  const actorId = options.actorId ?? participantIds.human;
  const at = options.at ?? artifact.updatedAt ?? now();
  const command = {
    actorId,
    at,
    rationale: options.rationale ?? defaultLedgerRationale(action, artifact),
  };
  const existing = findRequirementForArtifact(ledger.requirements, artifact.id);
  const source =
    existing ??
    createRequirementCandidateFromArtifact(artifact, {
      actorId,
      at,
      rationale: "Captured from a workshop requirement artifact.",
      acceptanceCriteria: [
        `The requirement is accepted as written in artifact ${artifact.id}.`,
      ],
    });
  const updatedRequirement = updateRequirementForLedgerAction(
    source,
    action,
    command,
  );
  const requirements = upsertRequirement(
    ledger.requirements,
    updatedRequirement,
  );
  const auditEvents = appendRequirementAuditEvents(
    ledger.auditEvents,
    updatedRequirement,
    context,
  );

  return {
    requirements,
    auditEvents,
  };
}

export function applyRuntimeConsolidationSuggestion(
  session: WorkshopSession,
  suggestion: RuntimeConsolidationSuggestion | string,
  options: RuntimeConsolidationActionOptions = {},
): WorkshopSession {
  const suggestionId = suggestionIdOf(suggestion);
  const domainSuggestion = selectArtifactConsolidationSuggestion(
    session,
    suggestionId,
  );
  const result = applyArtifactConsolidationSuggestion(
    session,
    [],
    domainSuggestion,
    options,
  );

  return result.session;
}

export function applyRuntimeConsolidationSuggestionWithLedger(
  session: WorkshopSession,
  ledger: RequirementRuntimeLedger,
  suggestion: RuntimeConsolidationSuggestion | string,
  context: RequirementRuntimeAuditContext,
  options: RuntimeConsolidationActionOptions = {},
): RuntimeConsolidationApplyResult {
  const suggestionId = suggestionIdOf(suggestion);
  const domainSuggestion = selectArtifactConsolidationSuggestion(
    session,
    suggestionId,
  );
  const actorId = options.actorId ?? participantIds.facilitator;
  const at = options.at ?? now();
  const result = applyArtifactConsolidationSuggestion(
    session,
    ledger.requirements,
    domainSuggestion,
    {
      ...options,
      actorId,
      at,
      approve: options.approve ?? true,
      acceptanceCriteria:
        options.acceptanceCriteria ??
        defaultConsolidationAcceptanceCriteria(domainSuggestion),
      rationale:
        options.rationale ??
        "Human approved the consolidation suggestion in the workshop.",
    },
  );
  const affectedRequirements = uniqueRequirementsById([
    ...result.createdRequirements,
    ...result.updatedRequirements,
  ]);
  const auditEvents = affectedRequirements.reduce(
    (events, requirement) =>
      appendRequirementAuditEvents(events, requirement, context),
    ledger.auditEvents,
  );

  return {
    session: result.session,
    ledger: {
      requirements: result.requirements,
      auditEvents,
    },
    createdRequirementIds: result.createdRequirements.map(
      (requirement) => requirement.id,
    ),
    updatedRequirementIds: result.updatedRequirements.map(
      (requirement) => requirement.id,
    ),
  };
}

export function parkRuntimeConsolidationSuggestion(
  session: WorkshopSession,
  suggestion: RuntimeConsolidationSuggestion | string,
  options: RequirementRuntimeActionOptions = {},
): WorkshopSession {
  const suggestionId = suggestionIdOf(suggestion);
  const domainSuggestion = selectArtifactConsolidationSuggestion(
    session,
    suggestionId,
  );
  const updatedAt = options.at ?? now();
  const sourceIds = new Set(domainSuggestion.sourceArtifactIds);

  return {
    ...session,
    artifacts: session.artifacts.map((artifact) =>
      sourceIds.has(artifact.id)
        ? {
            ...artifact,
            status: "parked",
            updatedAt,
            tags: addTags(artifact.tags, ["consolidation-parked"]),
          }
        : artifact,
    ),
    updatedAt,
  };
}

export function recordRuntimeConsolidationDecision(
  ledger: RequirementRuntimeLedger,
  suggestion: RuntimeConsolidationSuggestion | string,
  decision: RuntimeConsolidationDecision,
  context: RequirementRuntimeAuditContext,
  options: RuntimeConsolidationDecisionOptions = {},
): RequirementRuntimeLedger {
  const suggestionId = suggestionIdOf(suggestion);
  const action = `consolidation.${decision}` as const;
  const alreadyRecorded = ledger.auditEvents.some(
    (event) =>
      event.target.type === "consolidation" &&
      event.target.id === suggestionId &&
      event.action === action,
  );

  if (alreadyRecorded) {
    return ledger;
  }

  const suggestionMetadata =
    typeof suggestion === "string"
      ? {
          consolidationId: suggestionId,
        }
      : {
          consolidationId: suggestion.id,
          kind: suggestion.kind,
          sourceArtifactIds: suggestion.sourceArtifactIds,
          proposedRequirementTitles: suggestion.proposedRequirements.map(
            (requirement) => requirement.title,
          ),
          rationale: suggestion.rationale,
        };

  return {
    ...ledger,
    auditEvents: [
      ...ledger.auditEvents,
      createAuditEvent({
        sequence: nextAuditSequence(ledger.auditEvents),
        organizationId: context.organizationId,
        workshopId: context.workshopId,
        actorId: options.actorId ?? participantIds.human,
        at: options.at ?? now(),
        category: "consolidation",
        action,
        target: {
          type: "consolidation",
          id: suggestionId,
        },
        summary: `Consolidation suggestion ${suggestionId} ${decision}.`,
        metadata: {
          ...suggestionMetadata,
          decision,
          outputRequirementIds: options.outputRequirementIds ?? [],
        },
      }),
    ],
  };
}

function updateRequirementArtifactLifecycle(
  session: WorkshopSession,
  requirementId: string,
  status: ArtifactStatus,
  tagsToAdd: readonly string[],
  tagsToRemove: readonly string[],
  options: RequirementRuntimeActionOptions,
): WorkshopSession {
  const artifact = session.artifacts.find(
    (candidate) => candidate.id === requirementId,
  );
  if (!artifact || artifact.type !== "requirement") {
    throw new Error(
      `Requirement artifact ${requirementId} could not be found.`,
    );
  }

  const updatedAt = options.at ?? now();
  const removeSet = new Set(tagsToRemove.map((tag) => tag.toLowerCase()));

  return {
    ...session,
    artifacts: session.artifacts.map((candidate) =>
      candidate.id === requirementId
        ? {
            ...candidate,
            status,
            updatedAt,
            tags: addTags(
              candidate.tags.filter((tag) => !removeSet.has(tag.toLowerCase())),
              tagsToAdd,
            ),
          }
        : candidate,
    ),
    selectedArtifactId: requirementId,
    updatedAt,
  };
}

function toRuntimeConsolidationSuggestion(
  session: WorkshopSession,
  suggestion: ArtifactConsolidationSuggestion,
): RuntimeConsolidationSuggestion {
  return {
    id: suggestion.id,
    kind: suggestion.kind,
    title: titleForSuggestion(session, suggestion),
    rationale: suggestion.rationale,
    sourceArtifactIds: suggestion.sourceArtifactIds,
    proposedRequirements: suggestion.proposedRequirements.map(
      (requirement, index) => ({
        id: `${suggestion.id}-requirement-${index + 1}`,
        title: requirement.title,
        sourceArtifactIds:
          suggestion.kind === "split"
            ? suggestion.sourceArtifactIds
            : requirementSourceIds(suggestion),
      }),
    ),
    state: "pending",
  };
}

function titleForSuggestion(
  session: WorkshopSession,
  suggestion: ArtifactConsolidationSuggestion,
) {
  const sourceTitles = suggestion.sourceArtifactIds
    .map(
      (artifactId) =>
        session.artifacts.find((artifact) => artifact.id === artifactId)
          ?.title ?? artifactId,
    )
    .filter(Boolean);

  if (suggestion.kind === "merge") {
    return `Merge ${sourceTitles.join(" and ")}`;
  }

  return `Split ${sourceTitles[0] ?? "requirement material"}`;
}

function selectArtifactConsolidationSuggestion(
  session: WorkshopSession,
  suggestionId: string,
) {
  const suggestion = suggestArtifactConsolidations(session.artifacts).find(
    (candidate) => candidate.id === suggestionId,
  );
  if (!suggestion) {
    throw new Error(
      `Consolidation suggestion ${suggestionId} could not be found.`,
    );
  }
  return suggestion;
}

function requirementSourceIds(suggestion: ArtifactConsolidationSuggestion) {
  return suggestion.sourceArtifactIds;
}

function requirementIdOf(requirement: RequirementPanelItem | string) {
  return typeof requirement === "string" ? requirement : requirement.id;
}

function suggestionIdOf(suggestion: RuntimeConsolidationSuggestion | string) {
  return typeof suggestion === "string" ? suggestion : suggestion.id;
}

function addTags(
  existingTags: readonly string[],
  tagsToAdd: readonly string[],
) {
  return [...new Set([...existingTags, ...tagsToAdd])];
}

function findRequirementForArtifact(
  requirements: Requirement[],
  artifactId: string,
) {
  return requirements.find(
    (requirement) =>
      requirement.sourceRefs.some(
        (source) => source.artifactId === artifactId,
      ) || requirement.id === requirementIdFromArtifact(artifactId),
  );
}

function updateRequirementForLedgerAction(
  requirement: Requirement,
  action: RequirementRuntimeAuditedAction,
  command: RequirementRuntimeActionOptions & {
    actorId: string;
    at: string;
    rationale: string;
  },
) {
  if (action === "approved") {
    return requirement.state === "approved" || requirement.state === "baselined"
      ? requirement
      : approveRequirement(
          requirementForApproval(requirement, command),
          command,
        );
  }

  if (action === "rejected") {
    return requirement.state === "rejected"
      ? requirement
      : rejectRequirement(requirement, command);
  }

  if (action === "baselined") {
    const approved =
      requirement.state === "approved" || requirement.state === "baselined"
        ? requirement
        : approveRequirement(requirementForApproval(requirement, command), {
            ...command,
            rationale:
              "Approved before baselining from the requirements panel.",
          });

    return approved.state === "baselined"
      ? approved
      : baselineRequirement(approved, command);
  }

  return markRequirementSupersededFromPanel(requirement, command);
}

function requirementForApproval(
  requirement: Requirement,
  command: RequirementRuntimeActionOptions & {
    actorId: string;
    at: string;
    rationale: string;
  },
) {
  if (requirement.state === "candidate") {
    return requirement;
  }

  if (requirement.state === "draft") {
    return promoteRequirementToCandidate(requirement, {
      ...command,
      rationale: "Promoted before approval from the requirements panel.",
    });
  }

  if (requirement.state === "rejected") {
    return reopenRequirement(requirement, {
      ...command,
      rationale: "Reopened before approval from the requirements panel.",
    });
  }

  return requirement;
}

function upsertRequirement(
  requirements: Requirement[],
  updatedRequirement: Requirement,
) {
  const existingIndex = requirements.findIndex(
    (requirement) => requirement.id === updatedRequirement.id,
  );

  if (existingIndex < 0) {
    return [...requirements, updatedRequirement];
  }

  return requirements.map((requirement, index) =>
    index === existingIndex ? updatedRequirement : requirement,
  );
}

function markRequirementSupersededFromPanel(
  requirement: Requirement,
  command: RequirementRuntimeActionOptions & {
    actorId: string;
    at: string;
    rationale: string;
  },
): Requirement {
  if (requirement.state === "superseded") {
    return requirement;
  }

  const version = requirement.version + 1;

  return {
    ...requirement,
    state: "superseded",
    version,
    updatedAt: command.at,
    supersededByRequirementIds: requirement.supersededByRequirementIds ?? [],
    history: [
      ...requirement.history,
      {
        id: `${requirement.id}:history-${requirement.history.length + 1}`,
        action: "superseded",
        at: command.at,
        actorId: command.actorId,
        fromState: requirement.state,
        toState: "superseded",
        rationale: command.rationale,
        version,
        changes: [],
      },
    ],
  };
}

function appendRequirementAuditEvents(
  auditEvents: AuditEvent[],
  requirement: Requirement,
  context: RequirementRuntimeAuditContext,
) {
  const existingHistoryIds = new Set(
    auditEvents
      .filter((event) => event.target.id === requirement.id)
      .map((event) => event.metadata.historyEntryId)
      .filter(
        (historyEntryId): historyEntryId is string =>
          typeof historyEntryId === "string",
      ),
  );
  const nextSequence = nextAuditSequence(auditEvents);
  const newEvents = auditRequirementHistory(requirement, {
    ...context,
    sequenceStart: 1,
  })
    .filter(
      (event) =>
        typeof event.metadata.historyEntryId !== "string" ||
        !existingHistoryIds.has(event.metadata.historyEntryId),
    )
    .map((event, index) => ({
      ...event,
      id: createAuditEventId(context.workshopId, nextSequence + index),
    }));

  return [...auditEvents, ...newEvents];
}

function nextAuditSequence(auditEvents: AuditEvent[]) {
  const maxSequence = auditEvents.reduce((max, event) => {
    const sequence = Number(event.id.match(/:audit-(\d+)$/)?.[1]);
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return maxSequence + 1;
}

function createAuditEventId(workshopId: string, sequence: number) {
  return `${workshopId}:audit-${String(sequence).padStart(4, "0")}`;
}

function uniqueRequirementsById(requirements: Requirement[]) {
  const seen = new Set<string>();
  const unique: Requirement[] = [];

  for (const requirement of requirements) {
    if (seen.has(requirement.id)) {
      continue;
    }
    seen.add(requirement.id);
    unique.push(requirement);
  }

  return unique;
}

function defaultConsolidationAcceptanceCriteria(
  suggestion: ArtifactConsolidationSuggestion,
) {
  if (suggestion.kind === "merge") {
    return [
      `The merged requirement preserves the intent of source artifacts ${suggestion.sourceArtifactIds.join(", ")}.`,
    ];
  }

  return [
    `Each split requirement preserves a distinct clause from source artifact ${suggestion.sourceArtifactIds[0] ?? "unknown"}.`,
  ];
}

function defaultLedgerRationale(
  action: RequirementRuntimeAuditedAction,
  artifact: WorkshopArtifact,
) {
  if (action === "approved") {
    return `Approved requirement artifact ${artifact.id} from the requirements panel.`;
  }

  if (action === "rejected") {
    return `Rejected requirement artifact ${artifact.id} from the requirements panel.`;
  }

  if (action === "baselined") {
    return `Baselined requirement artifact ${artifact.id} from the requirements panel.`;
  }

  return `Marked requirement artifact ${artifact.id} as superseded from the requirements panel.`;
}

function requirementIdFromArtifact(artifactId: string) {
  return artifactId.startsWith("requirement-")
    ? artifactId
    : `requirement-${artifactId}`;
}
