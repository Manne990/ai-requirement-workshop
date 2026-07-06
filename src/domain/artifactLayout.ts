import type {
  ArtifactType,
  VisualizationMode,
  WorkshopArtifact,
} from "./workshop";

export type ArtifactPosition = {
  x: number;
  y: number;
};

export type ArtifactEdgeRoute = {
  sourceHandle: string;
  targetHandle: string;
};

export const artifactLayoutMetrics = {
  nodeWidth: 260,
  nodeHeight: 178,
  columnGap: 150,
  rowGap: 96,
};

const cellWidth =
  artifactLayoutMetrics.nodeWidth + artifactLayoutMetrics.columnGap;
const cellHeight =
  artifactLayoutMetrics.nodeHeight + artifactLayoutMetrics.rowGap;

export function layoutArtifactPositions(
  artifacts: Pick<WorkshopArtifact, "id" | "type">[],
  mode: VisualizationMode,
): Record<string, ArtifactPosition> {
  const rowCounts = new Map<string, number>();

  return Object.fromEntries(
    artifacts.map((artifact, index) => {
      const slot = artifactSlot(artifact.type, index, mode);
      const row =
        slot.fixedRow ??
        nextRowForSlot(rowCounts, `${mode}:${slot.column}:${slot.lane}`);

      return [
        artifact.id,
        {
          x: slot.column * cellWidth,
          y: row * cellHeight + slot.lane * Math.round(cellHeight * 0.5),
        },
      ];
    }),
  );
}

export function routeArtifactEdge(
  source?: ArtifactPosition,
  target?: ArtifactPosition,
): ArtifactEdgeRoute {
  if (!source || !target) {
    return {
      sourceHandle: "source-right",
      targetHandle: "target-left",
    };
  }

  if (target.y >= source.y) {
    return {
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
    };
  }

  return {
    sourceHandle: "source-top",
    targetHandle: "target-bottom",
  };
}

function artifactSlot(
  type: ArtifactType,
  index: number,
  mode: VisualizationMode,
) {
  if (mode === "journey") {
    return {
      column: index,
      lane: 0,
      fixedRow: journeyRow(type),
    };
  }

  if (mode === "requirements") {
    return {
      column: requirementsColumn(type),
      lane: 0,
    };
  }

  if (mode === "risks") {
    return {
      column: riskColumn(type),
      lane: 0,
    };
  }

  return {
    column: processColumn(type),
    lane: 0,
  };
}

function nextRowForSlot(rowCounts: Map<string, number>, key: string) {
  const row = rowCounts.get(key) ?? 0;
  rowCounts.set(key, row + 1);
  return row;
}

function processColumn(type: ArtifactType) {
  const columns: Record<ArtifactType, number> = {
    source: 0,
    problem: 0,
    goal: 0,
    actor: 1,
    "flow-step": 2,
    requirement: 3,
    decision: 4,
    question: 4,
    assumption: 5,
    risk: 5,
  };

  return columns[type];
}

function requirementsColumn(type: ArtifactType) {
  const columns: Record<ArtifactType, number> = {
    source: 0,
    goal: 0,
    problem: 0,
    actor: 1,
    requirement: 2,
    question: 3,
    decision: 3,
    assumption: 4,
    risk: 4,
    "flow-step": 5,
  };

  return columns[type];
}

function riskColumn(type: ArtifactType) {
  const columns: Record<ArtifactType, number> = {
    source: 0,
    problem: 0,
    goal: 0,
    actor: 1,
    "flow-step": 1,
    requirement: 2,
    decision: 2,
    question: 3,
    assumption: 4,
    risk: 4,
  };

  return columns[type];
}

function journeyRow(type: ArtifactType) {
  const rows: Record<ArtifactType, number> = {
    source: 0,
    actor: 0,
    problem: 1,
    goal: 1,
    "flow-step": 2,
    requirement: 3,
    decision: 3,
    question: 4,
    assumption: 4,
    risk: 4,
  };

  return rows[type];
}
