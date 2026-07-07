import { AlertTriangle, GitBranch, Link2, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import {
  buildTraceabilityGraph,
  findTraceabilityCoverageGaps,
  type TraceabilityCoverageGap,
  type TraceabilityGraph,
  type TraceabilityLink,
  type TraceabilityNode,
} from "../domain/traceability";
import type { WorkshopSession } from "../domain/workshop";
import "./TraceabilityPanel.css";

export type TraceabilityPanelProps = {
  session: WorkshopSession;
  selectedNodeId?: string;
  onSelectArtifact?: (artifactId: string) => void;
};

export function TraceabilityPanel({
  session,
  selectedNodeId,
  onSelectArtifact,
}: TraceabilityPanelProps) {
  const { graph, gaps, requirementRows, warningCount } = useMemo(() => {
    const traceabilityGraph = buildTraceabilityGraph(session);
    const coverageGaps = findTraceabilityCoverageGaps(traceabilityGraph);
    return {
      graph: traceabilityGraph,
      gaps: coverageGaps,
      requirementRows: buildRequirementRows(traceabilityGraph, coverageGaps),
      warningCount: traceabilityGraph.warnings.length,
    };
  }, [session]);

  const blockerCount = gaps.filter(
    (gap) => gap.targetKind === "requirement",
  ).length;

  return (
    <section className="traceability-panel" aria-label="Traceability coverage">
      <header className="traceability-panel__header">
        <div>
          <p className="traceability-panel__eyebrow">Traceability</p>
          <h2>Source to validation</h2>
        </div>
        <span className={blockerCount > 0 ? "has-gaps" : ""}>
          {blockerCount} requirement gap{blockerCount === 1 ? "" : "s"}
        </span>
      </header>

      <div
        className="traceability-panel__summary"
        aria-label="Traceability graph summary"
      >
        <Metric
          icon={GitBranch}
          label="Nodes"
          value={graph.nodes.length.toString()}
        />
        <Metric
          icon={Link2}
          label="Links"
          value={graph.links.length.toString()}
        />
        <Metric
          icon={AlertTriangle}
          label="Gaps"
          value={gaps.length.toString()}
        />
        <Metric
          icon={ShieldCheck}
          label="Warnings"
          value={warningCount.toString()}
        />
      </div>

      {requirementRows.length === 0 ? (
        <p className="traceability-panel__empty">
          No requirement nodes are ready for traceability review.
        </p>
      ) : (
        <div className="traceability-panel__rows">
          {requirementRows.map((row) => (
            <button
              type="button"
              className={`traceability-row${
                row.node.id === selectedNodeId ? " is-selected" : ""
              }${row.gaps.length > 0 ? " has-gaps" : ""}`}
              key={row.node.id}
              onClick={() => {
                if (row.node.kind === "requirement") {
                  onSelectArtifact?.(row.node.entityId);
                }
              }}
              aria-label={`Traceability for ${row.node.label}`}
            >
              <span className="traceability-row__title">{row.node.label}</span>
              <span className="traceability-row__summary">
                {row.node.summary}
              </span>
              <span className="traceability-row__chips">
                <Chip label="Sources" value={row.sourceCount} />
                <Chip label="Validation" value={row.validationCount} />
                <Chip label="Risks" value={row.riskCount} />
                <Chip label="Gaps" value={row.gaps.length} />
              </span>
              {row.gaps.length > 0 ? (
                <span className="traceability-row__gaps">
                  {row.gaps.slice(0, 2).map((gap) => (
                    <span key={`${row.node.id}-${gap.expectationId}`}>
                      {gap.detail}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="traceability-row__ok">Coverage linked</span>
              )}
            </button>
          ))}
        </div>
      )}

      {graph.warnings.length > 0 ? (
        <details className="traceability-panel__warnings">
          <summary>{graph.warnings.length} trace warning</summary>
          <ul>
            {graph.warnings.slice(0, 4).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof GitBranch;
  label: string;
  value: string;
}) {
  return (
    <div className="traceability-panel__metric">
      <Icon aria-hidden="true" size={15} />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <strong>{value}</strong> {label}
    </span>
  );
}

function buildRequirementRows(
  graph: TraceabilityGraph,
  gaps: TraceabilityCoverageGap[],
) {
  const linksBySource = groupLinks(graph.links, "sourceNodeId");
  const linksByTarget = groupLinks(graph.links, "targetNodeId");

  return graph.nodes
    .filter((node) => node.kind === "requirement")
    .map((node) => {
      const upstream = linksByTarget.get(node.id) ?? [];
      const downstream = linksBySource.get(node.id) ?? [];
      const rowGaps = gaps.filter((gap) => gap.targetNodeId === node.id);

      return {
        node,
        sourceCount: upstream.filter(isSourceLink).length,
        validationCount: countUniqueLinkedKinds(graph, downstream, [
          "test",
          "prototype",
        ]).length,
        riskCount: countUniqueLinkedKinds(graph, downstream, ["risk"]).length,
        gaps: rowGaps,
      };
    })
    .sort((left, right) => {
      const gapDelta = right.gaps.length - left.gaps.length;
      if (gapDelta !== 0) {
        return gapDelta;
      }
      return left.node.label.localeCompare(right.node.label);
    });
}

function groupLinks(
  links: TraceabilityLink[],
  key: "sourceNodeId" | "targetNodeId",
) {
  const grouped = new Map<string, TraceabilityLink[]>();
  for (const link of links) {
    const collection = grouped.get(link[key]) ?? [];
    collection.push(link);
    grouped.set(link[key], collection);
  }
  return grouped;
}

function isSourceLink(link: TraceabilityLink) {
  return link.type === "source-of" || link.type === "derived-from";
}

function countUniqueLinkedKinds(
  graph: TraceabilityGraph,
  links: TraceabilityLink[],
  kinds: TraceabilityNode["kind"][],
) {
  const nodeIds = new Set<string>();
  for (const link of links) {
    const node = graph.nodes.find(
      (candidate) => candidate.id === link.targetNodeId,
    );
    if (node && kinds.includes(node.kind)) {
      nodeIds.add(node.id);
    }
  }
  return [...nodeIds];
}
