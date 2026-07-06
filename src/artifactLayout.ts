import type {
  ArtifactType,
  VisualizationMode,
  WorkshopArtifact,
} from "./domain/workshop";

export type ArtifactCanvasPosition = { x: number; y: number };

export const artifactCanvasNodeBounds = {
  width: 238,
  height: 168,
} as const;

const columnGap = 96;
const rowGap = 84;
const columnStep = artifactCanvasNodeBounds.width + columnGap;
const rowStep = artifactCanvasNodeBounds.height + rowGap;
const processColumns = 4;
const riskLaneColumns = 3;

const requirementTypeOrder: ArtifactType[] = [
  "goal",
  "problem",
  "actor",
  "requirement",
  "question",
  "decision",
  "assumption",
  "risk",
  "flow-step",
];

export function layoutArtifacts(
  artifacts: readonly WorkshopArtifact[],
  mode: VisualizationMode,
): Record<string, ArtifactCanvasPosition> {
  if (mode === "requirements") {
    return layoutRequirements(artifacts);
  }

  if (mode === "risks") {
    return layoutRisks(artifacts);
  }

  if (mode === "journey") {
    return layoutJourney(artifacts);
  }

  return layoutProcess(artifacts);
}

function layoutProcess(
  artifacts: readonly WorkshopArtifact[],
): Record<string, ArtifactCanvasPosition> {
  return positionsFrom(artifacts, (_artifact, index) => ({
    x: (index % processColumns) * columnStep,
    y: Math.floor(index / processColumns) * rowStep,
  }));
}

function layoutRequirements(
  artifacts: readonly WorkshopArtifact[],
): Record<string, ArtifactCanvasPosition> {
  const rowsByColumn = new Map<number, number>();

  return positionsFrom(artifacts, (artifact) => {
    const column = Math.max(0, requirementTypeOrder.indexOf(artifact.type));
    const row = rowsByColumn.get(column) ?? 0;
    rowsByColumn.set(column, row + 1);

    return {
      x: column * columnStep,
      y: row * rowStep,
    };
  });
}

function layoutRisks(
  artifacts: readonly WorkshopArtifact[],
): Record<string, ArtifactCanvasPosition> {
  const laneCounts = [0, 0];

  return positionsFrom(artifacts, (artifact) => {
    const lane =
      artifact.type === "risk" || artifact.type === "assumption" ? 0 : 1;
    const laneIndex = laneCounts[lane];
    laneCounts[lane] += 1;
    const columnOffset = lane * (riskLaneColumns + 1);

    return {
      x: (columnOffset + (laneIndex % riskLaneColumns)) * columnStep,
      y: Math.floor(laneIndex / riskLaneColumns) * rowStep,
    };
  });
}

function layoutJourney(
  artifacts: readonly WorkshopArtifact[],
): Record<string, ArtifactCanvasPosition> {
  return positionsFrom(artifacts, (artifact, index) => ({
    x: index * columnStep,
    y: journeyLane(artifact.type) * rowStep,
  }));
}

function journeyLane(type: ArtifactType) {
  if (type === "actor") {
    return 0;
  }

  if (type === "decision" || type === "risk") {
    return 2;
  }

  return 1;
}

function positionsFrom(
  artifacts: readonly WorkshopArtifact[],
  getPosition: (
    artifact: WorkshopArtifact,
    index: number,
  ) => ArtifactCanvasPosition,
): Record<string, ArtifactCanvasPosition> {
  return Object.fromEntries(
    artifacts.map((artifact, index) => [
      artifact.id,
      getPosition(artifact, index),
    ]),
  );
}
