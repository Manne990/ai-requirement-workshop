import {
  applyArtifactConsolidationSuggestion,
  suggestArtifactConsolidations,
  type ApplyArtifactConsolidationOptions,
  type ArtifactConsolidationSuggestion,
  type ConsolidationSuggestionOptions,
} from "./artifactConsolidation";
import {
  selectRequirementPanelItems,
  type RequirementPanelItem,
} from "./requirements";
import type {
  ArtifactStatus,
  WorkshopArtifact,
  WorkshopSession,
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

export type RuntimeConsolidationActionOptions =
  ApplyArtifactConsolidationOptions;

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
