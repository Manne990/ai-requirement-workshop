import { Check, GitMerge, GitPullRequest, Pause } from "lucide-react";
import type { WorkshopArtifact } from "../domain/workshop";
import "./ConsolidationPanel.css";

export type ConsolidationSuggestionKind = "merge" | "split";

export type ConsolidationSuggestionState = "pending" | "applied" | "parked";

export type ConsolidationRequirementDraft = {
  id?: string;
  title: string;
  sourceArtifactIds?: string[];
};

export type ConsolidationSuggestion = {
  id: string;
  kind: ConsolidationSuggestionKind;
  title: string;
  rationale?: string;
  sourceArtifactIds: string[];
  proposedRequirements: ConsolidationRequirementDraft[];
  state?: ConsolidationSuggestionState;
};

export type ConsolidationPanelProps = {
  suggestions: ConsolidationSuggestion[];
  artifacts: Pick<
    WorkshopArtifact,
    "id" | "type" | "title" | "content" | "status"
  >[];
  onApplySuggestion: (suggestionId: string) => void;
  onParkSuggestion: (suggestionId: string) => void;
  className?: string;
};

const kindLabel: Record<ConsolidationSuggestionKind, string> = {
  merge: "Merge",
  split: "Split",
};

const stateLabel: Record<ConsolidationSuggestionState, string> = {
  pending: "Pending human decision",
  applied: "Applied",
  parked: "Parked",
};

export default function ConsolidationPanel({
  suggestions,
  artifacts,
  onApplySuggestion,
  onParkSuggestion,
  className,
}: ConsolidationPanelProps) {
  const artifactById = new Map(
    artifacts.map((artifact) => [artifact.id, artifact]),
  );
  const panelClassName = ["consolidation-panel", className]
    .filter(Boolean)
    .join(" ");
  const pendingSuggestionCount = suggestions.filter(
    (suggestion) => (suggestion.state ?? "pending") === "pending",
  ).length;

  return (
    <section className={panelClassName} aria-labelledby="consolidation-title">
      <header className="consolidation-panel-header">
        <div>
          <p className="consolidation-eyebrow">Consolidation</p>
          <h2 id="consolidation-title">Requirement suggestions</h2>
        </div>
        <span className="consolidation-count">
          {pendingSuggestionCount} pending review
        </span>
      </header>

      {suggestions.length === 0 ? (
        <p className="consolidation-empty">No consolidation suggestions.</p>
      ) : (
        <ul className="consolidation-list">
          {suggestions.map((suggestion) => (
            <ConsolidationSuggestionCard
              artifactById={artifactById}
              key={suggestion.id}
              onApplySuggestion={onApplySuggestion}
              onParkSuggestion={onParkSuggestion}
              suggestion={suggestion}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ConsolidationSuggestionCard({
  artifactById,
  suggestion,
  onApplySuggestion,
  onParkSuggestion,
}: {
  artifactById: Map<
    string,
    Pick<WorkshopArtifact, "id" | "type" | "title" | "content" | "status">
  >;
  suggestion: ConsolidationSuggestion;
  onApplySuggestion: (suggestionId: string) => void;
  onParkSuggestion: (suggestionId: string) => void;
}) {
  const Icon = suggestion.kind === "merge" ? GitMerge : GitPullRequest;
  const state = suggestion.state ?? "pending";
  const isPending = state === "pending";
  const sourceArtifacts = suggestion.sourceArtifactIds.map((artifactId) => ({
    id: artifactId,
    artifact: artifactById.get(artifactId),
  }));

  return (
    <li className={`consolidation-card state-${state}`}>
      <div className="consolidation-card-heading">
        <span className={`consolidation-kind kind-${suggestion.kind}`}>
          <Icon aria-hidden="true" size={15} />
          {kindLabel[suggestion.kind]}
        </span>
        <span className="consolidation-state">{stateLabel[state]}</span>
      </div>

      <h3>{suggestion.title}</h3>
      {suggestion.rationale ? (
        <p className="consolidation-rationale">{suggestion.rationale}</p>
      ) : null}

      <div className="consolidation-grid">
        <div className="consolidation-block">
          <h4>Source artifacts</h4>
          <ul className="consolidation-source-list">
            {sourceArtifacts.map(({ id, artifact }) => (
              <li key={id}>
                {artifact ? (
                  <>
                    <span>{artifact.type}</span>
                    <strong>{artifact.title}</strong>
                    <small>{artifact.content}</small>
                  </>
                ) : (
                  <>
                    <span>missing</span>
                    <strong>{id}</strong>
                    <small>Source artifact was not found.</small>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="consolidation-block">
          <h4>Proposed requirement titles</h4>
          <ol className="consolidation-requirement-list">
            {suggestion.proposedRequirements.map((requirement, index) => (
              <li key={requirement.id ?? `${suggestion.id}-${index}`}>
                <strong>{requirement.title}</strong>
                <small>
                  Sources:{" "}
                  {formatRequirementSources(
                    requirement.sourceArtifactIds,
                    suggestion.sourceArtifactIds,
                    artifactById,
                  )}
                </small>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="consolidation-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!isPending}
          onClick={() => onApplySuggestion(suggestion.id)}
        >
          <Check aria-hidden="true" size={16} />
          Apply
        </button>
        <button
          type="button"
          className="ghost-button"
          disabled={!isPending}
          onClick={() => onParkSuggestion(suggestion.id)}
        >
          <Pause aria-hidden="true" size={16} />
          Park
        </button>
      </div>
    </li>
  );
}

function formatRequirementSources(
  requirementSourceIds: string[] | undefined,
  fallbackSourceIds: string[],
  artifactById: Map<
    string,
    Pick<WorkshopArtifact, "id" | "type" | "title" | "content" | "status">
  >,
) {
  const sourceIds =
    requirementSourceIds && requirementSourceIds.length > 0
      ? requirementSourceIds
      : fallbackSourceIds;

  return sourceIds
    .map((sourceId) => artifactById.get(sourceId)?.title ?? sourceId)
    .join(", ");
}
