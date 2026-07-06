import type { WorkshopArtifact } from "./workshop";

export type RequirementState =
  "draft" | "candidate" | "approved" | "rejected" | "superseded" | "baselined";

export type RequirementHistoryAction =
  | "created"
  | "merged"
  | "split"
  | "promoted"
  | "approved"
  | "rejected"
  | "reopened"
  | "baselined"
  | "superseded"
  | "edited"
  | "source-linked";

export type RequirementSourceRef = {
  artifactId?: string;
  messageId?: string;
  participantId?: string;
};

export type RequirementAcceptanceCriterion = {
  id: string;
  text: string;
};

export type RequirementHistoryChange = {
  field:
    | "title"
    | "statement"
    | "acceptanceCriteria"
    | "rationale"
    | "sourceRefs"
    | "supersededByRequirementId"
    | "supersededByRequirementIds";
  before?: unknown;
  after?: unknown;
};

export type RequirementHistoryEntry = {
  id: string;
  action: RequirementHistoryAction;
  at: string;
  actorId: string;
  fromState?: RequirementState;
  toState: RequirementState;
  rationale: string;
  version: number;
  changes: RequirementHistoryChange[];
};

export type Requirement = {
  id: string;
  title: string;
  statement: string;
  state: RequirementState;
  version: number;
  acceptanceCriteria: RequirementAcceptanceCriterion[];
  rationale: string;
  sourceRefs: RequirementSourceRef[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  baselinedAt?: string;
  baselinedBy?: string;
  supersededByRequirementId?: string;
  supersededByRequirementIds?: string[];
  history: RequirementHistoryEntry[];
};

export type RequirementLifecycleCommand = {
  actorId: string;
  rationale: string;
  at?: string;
};

export type RequirementCreateInput = {
  id: string;
  title: string;
  statement: string;
  createdAt: string;
  createdBy: string;
  state?: "draft" | "candidate";
  acceptanceCriteria?: RequirementAcceptanceCriterionInput[];
  rationale?: string;
  sourceRefs?: RequirementSourceRef[];
};

export type RequirementAcceptanceCriterionInput =
  string | RequirementAcceptanceCriterion;

export type RequirementRevision = {
  title?: string;
  statement?: string;
  acceptanceCriteria?: RequirementAcceptanceCriterionInput[];
  rationale?: string;
  sourceRefs?: RequirementSourceRef[];
};

export type RequirementConsolidationInput = {
  id: string;
  title: string;
  statement: string;
  state?: "candidate" | "approved";
  acceptanceCriteria?: RequirementAcceptanceCriterionInput[];
  rationale?: string;
  sourceRefs?: RequirementSourceRef[];
};

export type RequirementSplitInput = RequirementConsolidationInput;

export type RequirementConsolidationResult = {
  requirements: Requirement[];
  createdRequirements: Requirement[];
  supersededRequirements: Requirement[];
};

export type RequirementArtifactDerivationOptions = {
  actorId?: string;
  at?: string;
  rationale?: string;
  acceptanceCriteria?: RequirementAcceptanceCriterionInput[];
};

export type RequirementBacklogDerivation = {
  requirements: Requirement[];
  createdRequirements: Requirement[];
  updatedRequirements: Requirement[];
  linkedArtifactIds: string[];
};

export type RequirementLifecycleStatus = RequirementState;

export type RequirementPanelHistoryEntry = {
  id: string;
  changedAt: string;
  changedBy: string;
  fromStatus?: RequirementLifecycleStatus;
  toStatus: RequirementLifecycleStatus;
  reason?: string;
};

export type RequirementPanelItem = {
  id: string;
  title: string;
  statement: string;
  status: RequirementLifecycleStatus;
  version?: string;
  owner?: string;
  updatedAt?: string;
  tags: string[];
  sourceArtifactIds: string[];
  sourceMessageIds: string[];
  history: RequirementPanelHistoryEntry[];
};

export const requirementLifecycleOrder: RequirementLifecycleStatus[] = [
  "candidate",
  "approved",
  "draft",
  "baselined",
  "rejected",
  "superseded",
];

export const requirementLifecycleLabel: Record<
  RequirementLifecycleStatus,
  string
> = {
  draft: "Draft",
  candidate: "Candidate",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
  baselined: "Baselined",
};

export const requirementTransitions = {
  draft: ["candidate", "rejected", "superseded"],
  candidate: ["approved", "rejected", "superseded"],
  approved: ["candidate", "baselined", "superseded"],
  rejected: ["candidate"],
  baselined: ["superseded"],
  superseded: [],
} satisfies Record<RequirementState, readonly RequirementState[]>;

const systemActorId = "system";

const now = () => new Date().toISOString();

function defaultCreateRationale(action: "created" | "merged" | "split") {
  if (action === "merged") {
    return "Requirement created by merging reviewed requirement material.";
  }
  if (action === "split") {
    return "Requirement created by splitting broad requirement material.";
  }
  return "Requirement created.";
}

export function createRequirement(input: RequirementCreateInput): Requirement {
  return createRequirementWithHistoryAction(input, "created");
}

export function selectRequirementPanelItems(
  artifacts: WorkshopArtifact[],
): RequirementPanelItem[] {
  return artifacts
    .filter((artifact) => artifact.type === "requirement")
    .map((artifact) => ({
      id: artifact.id,
      title: artifact.title,
      statement: artifact.content,
      status: requirementStatusFromArtifact(artifact),
      updatedAt: artifact.updatedAt,
      owner: artifact.createdBy,
      tags: artifact.tags,
      sourceArtifactIds: artifact.source.artifactId
        ? [artifact.source.artifactId]
        : [],
      sourceMessageIds: artifact.source.messageId
        ? [artifact.source.messageId]
        : [],
      history: [],
    }))
    .sort(compareRequirementsForReview);
}

export function groupRequirementsByLifecycle(
  requirements: RequirementPanelItem[],
): Record<RequirementLifecycleStatus, RequirementPanelItem[]> {
  return requirementLifecycleOrder.reduce(
    (groups, status) => {
      groups[status] = requirements
        .filter((requirement) => requirement.status === status)
        .sort(compareRequirementsForReview);
      return groups;
    },
    {} as Record<RequirementLifecycleStatus, RequirementPanelItem[]>,
  );
}

function createRequirementWithHistoryAction(
  input: RequirementCreateInput,
  historyAction: "created" | "merged" | "split",
): Requirement {
  const state = input.state ?? "draft";
  const title = assertNonEmpty(input.title, "Requirement title");
  const statement = assertNonEmpty(input.statement, "Requirement statement");
  const acceptanceCriteria = normalizeAcceptanceCriteria(
    input.acceptanceCriteria ?? [],
  );
  const sourceRefs = normalizeSourceRefs(input.sourceRefs ?? []);
  const rationale = (input.rationale ?? "").trim();
  const requirement: Requirement = {
    id: assertNonEmpty(input.id, "Requirement id"),
    title,
    statement,
    state,
    version: 1,
    acceptanceCriteria,
    rationale,
    sourceRefs,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    updatedAt: input.createdAt,
    history: [],
  };

  return {
    ...requirement,
    history: [
      createHistoryEntry(requirement, historyAction, state, {
        actorId: input.createdBy,
        at: input.createdAt,
        rationale: rationale || defaultCreateRationale(historyAction),
      }),
    ],
  };
}

function requirementStatusFromArtifact(
  artifact: WorkshopArtifact,
): RequirementLifecycleStatus {
  const tags = new Set(artifact.tags.map((tag) => tag.toLowerCase()));

  if (tags.has("baselined") || tags.has("baseline")) {
    return "baselined";
  }

  if (tags.has("superseded") || tags.has("supersede")) {
    return "superseded";
  }

  if (artifact.status === "accepted") {
    return "approved";
  }

  if (artifact.status === "rejected") {
    return "rejected";
  }

  if (
    tags.has("candidate") ||
    artifact.title.toLowerCase().includes("candidate")
  ) {
    return "candidate";
  }

  return "draft";
}

function compareRequirementsForReview(
  left: RequirementPanelItem,
  right: RequirementPanelItem,
) {
  const statusDifference =
    requirementLifecycleOrder.indexOf(left.status) -
    requirementLifecycleOrder.indexOf(right.status);

  if (statusDifference !== 0) {
    return statusDifference;
  }

  return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
}

export function createRequirementCandidateFromArtifact(
  artifact: WorkshopArtifact,
  options: RequirementArtifactDerivationOptions = {},
): Requirement {
  if (artifact.type !== "requirement") {
    throw new Error(
      `Only requirement artifacts can be promoted to requirements; received ${artifact.type}.`,
    );
  }

  const sourceRefs = [
    {
      artifactId: artifact.id,
      messageId: artifact.source.messageId,
      participantId: artifact.source.participantId,
    },
  ];

  return createRequirement({
    id: requirementIdFromArtifact(artifact.id),
    title: artifact.title,
    statement: artifact.content,
    state: "candidate",
    createdAt: options.at ?? artifact.updatedAt,
    createdBy: options.actorId ?? artifact.createdBy,
    acceptanceCriteria: options.acceptanceCriteria ?? [],
    rationale:
      options.rationale ?? "Derived from a workshop requirement artifact.",
    sourceRefs,
  });
}

export function deriveRequirementsFromArtifacts(
  artifacts: WorkshopArtifact[],
  existingRequirements: Requirement[] = [],
  options: RequirementArtifactDerivationOptions = {},
): RequirementBacklogDerivation {
  const requirements = [...existingRequirements];
  const createdRequirements: Requirement[] = [];
  const updatedRequirements: Requirement[] = [];
  const linkedArtifactIds: string[] = [];

  for (const artifact of artifacts) {
    if (artifact.type !== "requirement") {
      continue;
    }

    const sourceRef = {
      artifactId: artifact.id,
      messageId: artifact.source.messageId,
      participantId: artifact.source.participantId,
    };
    const existingIndex = findRequirementIndexForArtifact(
      requirements,
      artifact,
    );

    if (existingIndex >= 0) {
      linkedArtifactIds.push(artifact.id);
      const existing = requirements[existingIndex];
      const updated = linkRequirementSource(existing, sourceRef, {
        actorId: options.actorId ?? systemActorId,
        at: options.at ?? artifact.updatedAt,
        rationale:
          options.rationale ??
          "Linked a duplicate requirement artifact as source evidence.",
      });

      if (updated !== existing) {
        requirements[existingIndex] = updated;
        updatedRequirements.push(updated);
      }
      continue;
    }

    const candidate = createRequirementCandidateFromArtifact(artifact, options);
    requirements.push(candidate);
    createdRequirements.push(candidate);
    linkedArtifactIds.push(artifact.id);
  }

  return {
    requirements,
    createdRequirements,
    updatedRequirements,
    linkedArtifactIds,
  };
}

export function validRequirementTransitions(
  state: RequirementState,
): readonly RequirementState[] {
  return requirementTransitions[state];
}

export function mergeRequirements(
  requirements: Requirement[],
  sourceRequirementIds: string[],
  input: RequirementConsolidationInput,
  command: RequirementLifecycleCommand,
): RequirementConsolidationResult {
  const sources = readConsolidationSources(
    requirements,
    sourceRequirementIds,
    2,
  );
  const replacement = createReplacementRequirement(
    "merged",
    input,
    sources,
    command,
    "Merged from reviewed requirement candidates.",
  );
  const supersededRequirements = sources.map((source) =>
    supersedeRequirementByMany(source, [replacement.id], command),
  );

  return {
    requirements: replaceRequirements(
      requirements,
      supersededRequirements,
    ).concat(replacement),
    createdRequirements: [replacement],
    supersededRequirements,
  };
}

export function splitRequirement(
  requirements: Requirement[],
  sourceRequirementId: string,
  inputs: RequirementSplitInput[],
  command: RequirementLifecycleCommand,
): RequirementConsolidationResult {
  const [source] = readConsolidationSources(
    requirements,
    [sourceRequirementId],
    1,
  );
  if (!source) {
    throw new Error(`Requirement ${sourceRequirementId} could not be found.`);
  }

  const createdRequirements = inputs.map((input) =>
    createReplacementRequirement(
      "split",
      input,
      [source],
      command,
      "Split from a broad requirement candidate.",
    ),
  );
  if (createdRequirements.length < 2) {
    throw new Error(
      "Splitting a requirement requires at least two replacements.",
    );
  }

  const supersededRequirements = [
    supersedeRequirementByMany(
      source,
      createdRequirements.map((requirement) => requirement.id),
      command,
    ),
  ];

  return {
    requirements: replaceRequirements(
      requirements,
      supersededRequirements,
    ).concat(createdRequirements),
    createdRequirements,
    supersededRequirements,
  };
}

export function canTransitionRequirement(
  fromState: RequirementState,
  toState: RequirementState,
) {
  const transitions: readonly RequirementState[] =
    requirementTransitions[fromState];
  return transitions.includes(toState);
}

export function promoteRequirementToCandidate(
  requirement: Requirement,
  command: RequirementLifecycleCommand,
): Requirement {
  return transitionRequirement(requirement, "candidate", "promoted", command);
}

export function approveRequirement(
  requirement: Requirement,
  command: RequirementLifecycleCommand,
): Requirement {
  assertApprovalReady(requirement, command);
  const approved = transitionRequirement(
    requirement,
    "approved",
    "approved",
    command,
  );

  return {
    ...approved,
    approvedAt: command.at ?? approved.updatedAt,
    approvedBy: command.actorId,
    rejectedAt: undefined,
    rejectedBy: undefined,
  };
}

export function rejectRequirement(
  requirement: Requirement,
  command: RequirementLifecycleCommand,
): Requirement {
  assertCommandRationale(command, "Rejecting a requirement");
  const rejected = transitionRequirement(
    requirement,
    "rejected",
    "rejected",
    command,
  );

  return {
    ...rejected,
    rejectedAt: command.at ?? rejected.updatedAt,
    rejectedBy: command.actorId,
    approvedAt: undefined,
    approvedBy: undefined,
  };
}

export function reopenRequirement(
  requirement: Requirement,
  command: RequirementLifecycleCommand,
): Requirement {
  assertCommandRationale(command, "Reopening a requirement");
  const reopened = transitionRequirement(
    requirement,
    "candidate",
    "reopened",
    command,
  );

  return {
    ...reopened,
    approvedAt: undefined,
    approvedBy: undefined,
    rejectedAt: undefined,
    rejectedBy: undefined,
  };
}

export function baselineRequirement(
  requirement: Requirement,
  command: RequirementLifecycleCommand,
): Requirement {
  assertCommandRationale(command, "Baselining a requirement");
  const baselined = transitionRequirement(
    requirement,
    "baselined",
    "baselined",
    command,
  );

  return {
    ...baselined,
    baselinedAt: command.at ?? baselined.updatedAt,
    baselinedBy: command.actorId,
  };
}

export function supersedeRequirement(
  requirement: Requirement,
  supersededByRequirementId: string,
  command: RequirementLifecycleCommand,
): Requirement {
  const replacementId = assertNonEmpty(
    supersededByRequirementId,
    "Superseding requirement id",
  );
  if (replacementId === requirement.id) {
    throw new Error("A requirement cannot supersede itself.");
  }

  assertCommandRationale(command, "Superseding a requirement");
  return transitionRequirement(
    requirement,
    "superseded",
    "superseded",
    command,
    [
      {
        field: "supersededByRequirementId",
        before: requirement.supersededByRequirementId,
        after: replacementId,
      },
      {
        field: "supersededByRequirementIds",
        before: requirement.supersededByRequirementIds,
        after: [replacementId],
      },
    ],
    {
      supersededByRequirementId: replacementId,
      supersededByRequirementIds: [replacementId],
    },
  );
}

export function reviseRequirement(
  requirement: Requirement,
  revision: RequirementRevision,
  command: RequirementLifecycleCommand,
): Requirement {
  if (requirement.state === "baselined" || requirement.state === "superseded") {
    throw new Error(
      `Cannot edit a ${requirement.state} requirement; reopen or supersede it instead.`,
    );
  }
  assertCommandRationale(command, "Editing a requirement");

  const nextTitle =
    revision.title === undefined
      ? requirement.title
      : assertNonEmpty(revision.title, "Requirement title");
  const nextStatement =
    revision.statement === undefined
      ? requirement.statement
      : assertNonEmpty(revision.statement, "Requirement statement");
  const nextRationale =
    revision.rationale === undefined
      ? requirement.rationale
      : revision.rationale.trim();
  const nextAcceptanceCriteria =
    revision.acceptanceCriteria === undefined
      ? requirement.acceptanceCriteria
      : normalizeAcceptanceCriteria(revision.acceptanceCriteria);
  const nextSourceRefs =
    revision.sourceRefs === undefined
      ? requirement.sourceRefs
      : normalizeSourceRefs(revision.sourceRefs);
  const changes = collectRevisionChanges(requirement, {
    title: nextTitle,
    statement: nextStatement,
    rationale: nextRationale,
    acceptanceCriteria: nextAcceptanceCriteria,
    sourceRefs: nextSourceRefs,
  });

  if (changes.length === 0) {
    return requirement;
  }

  const updated = {
    ...requirement,
    title: nextTitle,
    statement: nextStatement,
    rationale: nextRationale,
    acceptanceCriteria: nextAcceptanceCriteria,
    sourceRefs: nextSourceRefs,
    version: requirement.version + 1,
    updatedAt: command.at ?? now(),
  };

  return {
    ...updated,
    history: [
      ...requirement.history,
      createHistoryEntry(
        updated,
        "edited",
        requirement.state,
        command,
        requirement.state,
        changes,
      ),
    ],
  };
}

function createReplacementRequirement(
  action: "merged" | "split",
  input: RequirementConsolidationInput,
  sources: Requirement[],
  command: RequirementLifecycleCommand,
  defaultRationale: string,
): Requirement {
  assertCommandRationale(command, `${action} requirement`);
  const targetState = input.state ?? "candidate";
  const sourceRefs = mergeSourceRefs(
    sources.flatMap((source) => source.sourceRefs),
    input.sourceRefs ?? [],
  );
  const created = createRequirementWithHistoryAction(
    {
      id: assertNonEmpty(input.id, "Requirement id"),
      title: input.title,
      statement: input.statement,
      state: "candidate",
      createdAt: command.at ?? now(),
      createdBy: command.actorId,
      acceptanceCriteria: input.acceptanceCriteria ?? mergedCriteria(sources),
      rationale: input.rationale ?? defaultRationale,
      sourceRefs,
    },
    action,
  );

  if (targetState === "candidate") {
    return created;
  }

  return approveRequirement(created, {
    ...command,
    rationale: command.rationale,
  });
}

function readConsolidationSources(
  requirements: Requirement[],
  sourceRequirementIds: string[],
  minimumCount: number,
) {
  const uniqueIds = [
    ...new Set(
      sourceRequirementIds.map((requirementId) => requirementId.trim()),
    ),
  ].filter(Boolean);
  if (uniqueIds.length < minimumCount) {
    throw new Error(
      `Expected at least ${minimumCount} source requirement${
        minimumCount === 1 ? "" : "s"
      }.`,
    );
  }

  return uniqueIds.map((requirementId) => {
    const requirement = requirements.find(
      (candidate) => candidate.id === requirementId,
    );
    if (!requirement) {
      throw new Error(`Requirement ${requirementId} could not be found.`);
    }
    if (
      requirement.state === "rejected" ||
      requirement.state === "superseded"
    ) {
      throw new Error(
        `Requirement ${requirementId} cannot be consolidated from ${requirement.state}.`,
      );
    }
    return requirement;
  });
}

function supersedeRequirementByMany(
  requirement: Requirement,
  replacementIds: string[],
  command: RequirementLifecycleCommand,
) {
  const uniqueReplacementIds = [
    ...new Set(
      replacementIds.map((requirementId) =>
        assertNonEmpty(requirementId, "Superseding requirement id"),
      ),
    ),
  ];
  if (uniqueReplacementIds.includes(requirement.id)) {
    throw new Error("A requirement cannot supersede itself.");
  }
  assertCommandRationale(command, "Superseding a requirement");

  const primaryReplacementId = uniqueReplacementIds[0];
  if (!primaryReplacementId) {
    throw new Error("Superseding a requirement requires a replacement.");
  }

  return transitionRequirement(
    requirement,
    "superseded",
    "superseded",
    command,
    [
      {
        field: "supersededByRequirementId",
        before: requirement.supersededByRequirementId,
        after: primaryReplacementId,
      },
      {
        field: "supersededByRequirementIds",
        before: requirement.supersededByRequirementIds,
        after: uniqueReplacementIds,
      },
    ],
    {
      supersededByRequirementId: primaryReplacementId,
      supersededByRequirementIds: uniqueReplacementIds,
    },
  );
}

function replaceRequirements(
  requirements: Requirement[],
  replacements: Requirement[],
) {
  const byId = new Map(
    replacements.map((requirement) => [requirement.id, requirement]),
  );

  return requirements.map(
    (requirement) => byId.get(requirement.id) ?? requirement,
  );
}

function mergedCriteria(
  sources: Requirement[],
): RequirementAcceptanceCriterionInput[] {
  return sources.flatMap((source) =>
    source.acceptanceCriteria.map((criterion) => ({
      id: `${source.id}-${criterion.id}`,
      text: criterion.text,
    })),
  );
}

function transitionRequirement(
  requirement: Requirement,
  toState: RequirementState,
  action: RequirementHistoryAction,
  command: RequirementLifecycleCommand,
  changes: RequirementHistoryChange[] = [],
  extra: Partial<Requirement> = {},
): Requirement {
  if (!canTransitionRequirement(requirement.state, toState)) {
    throw new Error(
      `Invalid requirement transition from ${requirement.state} to ${toState}.`,
    );
  }
  assertCommandRationale(command, `${action} requirement`);

  const next = {
    ...requirement,
    ...extra,
    state: toState,
    version: requirement.version + 1,
    updatedAt: command.at ?? now(),
  };

  return {
    ...next,
    history: [
      ...requirement.history,
      createHistoryEntry(
        next,
        action,
        toState,
        command,
        requirement.state,
        changes,
      ),
    ],
  };
}

function linkRequirementSource(
  requirement: Requirement,
  sourceRef: RequirementSourceRef,
  command: RequirementLifecycleCommand,
): Requirement {
  const sourceRefs = mergeSourceRefs(requirement.sourceRefs, [sourceRef]);
  if (sourceRefs.length === requirement.sourceRefs.length) {
    return requirement;
  }

  const updated = {
    ...requirement,
    sourceRefs,
    version: requirement.version + 1,
    updatedAt: command.at ?? now(),
  };

  return {
    ...updated,
    history: [
      ...requirement.history,
      createHistoryEntry(
        updated,
        "source-linked",
        requirement.state,
        command,
        requirement.state,
        [
          {
            field: "sourceRefs",
            before: requirement.sourceRefs,
            after: sourceRefs,
          },
        ],
      ),
    ],
  };
}

function assertApprovalReady(
  requirement: Requirement,
  command: RequirementLifecycleCommand,
) {
  assertCommandRationale(command, "Approving a requirement");
  if (requirement.acceptanceCriteria.length === 0) {
    throw new Error("Approved requirements need acceptance criteria.");
  }
  if (
    !requirement.sourceRefs.some(
      (source) => source.artifactId || source.messageId,
    )
  ) {
    throw new Error("Approved requirements need a source artifact or message.");
  }
}

function assertCommandRationale(
  command: RequirementLifecycleCommand,
  action: string,
) {
  if (!command.actorId.trim()) {
    throw new Error(`${action} requires an actor.`);
  }
  if (!command.rationale.trim()) {
    throw new Error(`${action} requires a rationale.`);
  }
}

function createHistoryEntry(
  requirement: Requirement,
  action: RequirementHistoryAction,
  toState: RequirementState,
  command: RequirementLifecycleCommand,
  fromState?: RequirementState,
  changes: RequirementHistoryChange[] = [],
): RequirementHistoryEntry {
  return {
    id: `${requirement.id}:history-${requirement.history.length + 1}`,
    action,
    at: command.at ?? requirement.updatedAt,
    actorId: command.actorId,
    fromState,
    toState,
    rationale: command.rationale.trim(),
    version: requirement.version,
    changes,
  };
}

function normalizeAcceptanceCriteria(
  criteria: RequirementAcceptanceCriterionInput[],
): RequirementAcceptanceCriterion[] {
  return criteria
    .map((criterion, index) => {
      if (typeof criterion === "string") {
        return {
          id: `ac-${index + 1}`,
          text: criterion.trim(),
        };
      }

      return {
        id: criterion.id.trim() || `ac-${index + 1}`,
        text: criterion.text.trim(),
      };
    })
    .filter((criterion) => criterion.text.length > 0);
}

function normalizeSourceRefs(
  sourceRefs: RequirementSourceRef[],
): RequirementSourceRef[] {
  return mergeSourceRefs([], sourceRefs).filter(
    (source) => source.artifactId || source.messageId || source.participantId,
  );
}

function mergeSourceRefs(
  current: RequirementSourceRef[],
  next: RequirementSourceRef[],
): RequirementSourceRef[] {
  const byKey = new Map<string, RequirementSourceRef>();
  for (const source of [...current, ...next]) {
    const normalized = {
      artifactId: source.artifactId?.trim() || undefined,
      messageId: source.messageId?.trim() || undefined,
      participantId: source.participantId?.trim() || undefined,
    };
    const key = sourceRefKey(normalized);
    if (key !== "||") {
      byKey.set(key, normalized);
    }
  }

  return [...byKey.values()];
}

function sourceRefKey(source: RequirementSourceRef) {
  return `${source.artifactId ?? ""}|${source.messageId ?? ""}|${
    source.participantId ?? ""
  }`;
}

function findRequirementIndexForArtifact(
  requirements: Requirement[],
  artifact: WorkshopArtifact,
) {
  const sourceIndex = requirements.findIndex((requirement) =>
    requirement.sourceRefs.some((source) => source.artifactId === artifact.id),
  );
  if (sourceIndex >= 0) {
    return sourceIndex;
  }

  const signature = requirementArtifactSignature(artifact);
  return requirements.findIndex(
    (requirement) => requirementSignature(requirement) === signature,
  );
}

function requirementArtifactSignature(artifact: WorkshopArtifact) {
  return normalizeForSignature(`${artifact.title}\n${artifact.content}`);
}

function requirementSignature(requirement: Requirement) {
  return normalizeForSignature(
    `${requirement.title}\n${requirement.statement}`,
  );
}

function normalizeForSignature(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function requirementIdFromArtifact(artifactId: string) {
  return artifactId.startsWith("requirement-")
    ? artifactId
    : `requirement-${artifactId}`;
}

function collectRevisionChanges(
  requirement: Requirement,
  next: {
    title: string;
    statement: string;
    rationale: string;
    acceptanceCriteria: RequirementAcceptanceCriterion[];
    sourceRefs: RequirementSourceRef[];
  },
): RequirementHistoryChange[] {
  const changes: RequirementHistoryChange[] = [];

  if (next.title !== requirement.title) {
    changes.push({
      field: "title",
      before: requirement.title,
      after: next.title,
    });
  }
  if (next.statement !== requirement.statement) {
    changes.push({
      field: "statement",
      before: requirement.statement,
      after: next.statement,
    });
  }
  if (next.rationale !== requirement.rationale) {
    changes.push({
      field: "rationale",
      before: requirement.rationale,
      after: next.rationale,
    });
  }
  if (
    JSON.stringify(next.acceptanceCriteria) !==
    JSON.stringify(requirement.acceptanceCriteria)
  ) {
    changes.push({
      field: "acceptanceCriteria",
      before: requirement.acceptanceCriteria,
      after: next.acceptanceCriteria,
    });
  }
  if (
    JSON.stringify(next.sourceRefs) !== JSON.stringify(requirement.sourceRefs)
  ) {
    changes.push({
      field: "sourceRefs",
      before: requirement.sourceRefs,
      after: next.sourceRefs,
    });
  }

  return changes;
}

function assertNonEmpty(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  return trimmed;
}
