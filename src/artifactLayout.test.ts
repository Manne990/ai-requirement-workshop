import { describe, expect, it } from "vitest";
import {
  artifactCanvasNodeBounds,
  layoutArtifacts,
  type ArtifactCanvasPosition,
} from "./artifactLayout";
import type {
  ArtifactType,
  VisualizationMode,
  WorkshopArtifact,
} from "./domain/workshop";

describe("layoutArtifacts", () => {
  it("stacks repeated requirement artifacts in one column without overlap", () => {
    const artifacts = createArtifacts(
      Array.from({ length: 8 }, () => "requirement"),
    );

    const positions = layoutArtifacts(artifacts, "requirements");
    const xPositions = artifacts.map((artifact) => positions[artifact.id].x);
    const yPositions = artifacts.map((artifact) => positions[artifact.id].y);

    expect(new Set(xPositions)).toHaveLength(1);
    expect(overlappingPairs(artifacts, positions)).toEqual([]);

    for (let index = 1; index < yPositions.length; index += 1) {
      expect(yPositions[index] - yPositions[index - 1]).toBeGreaterThanOrEqual(
        artifactCanvasNodeBounds.height,
      );
    }
  });

  it("keeps risk artifacts and supporting artifacts in separate non-overlapping lanes", () => {
    const riskArtifacts = createArtifacts(
      ["risk", "assumption", "risk", "assumption", "risk", "risk"],
      "risk",
    );
    const supportArtifacts = createArtifacts(
      ["goal", "problem", "requirement", "question", "decision", "actor"],
      "support",
    );
    const artifacts = [...riskArtifacts, ...supportArtifacts];

    const positions = layoutArtifacts(artifacts, "risks");
    const riskLaneRightEdge = Math.max(
      ...riskArtifacts.map(
        (artifact) => positions[artifact.id].x + artifactCanvasNodeBounds.width,
      ),
    );
    const supportLaneLeftEdge = Math.min(
      ...supportArtifacts.map((artifact) => positions[artifact.id].x),
    );

    expect(riskLaneRightEdge).toBeLessThan(supportLaneLeftEdge);
    expect(overlappingPairs(artifacts, positions)).toEqual([]);
  });

  it.each<VisualizationMode>(["process", "journey", "requirements", "risks"])(
    "returns deterministic non-overlapping positions in %s mode",
    (mode) => {
      const artifacts = createArtifacts([
        "goal",
        "problem",
        "actor",
        "requirement",
        "question",
        "decision",
        "assumption",
        "risk",
        "flow-step",
        "requirement",
        "question",
        "risk",
        "assumption",
        "decision",
        "actor",
        "requirement",
      ]);

      const firstLayout = layoutArtifacts(artifacts, mode);
      const secondLayout = layoutArtifacts(artifacts, mode);

      expect(firstLayout).toEqual(secondLayout);
      expect(overlappingPairs(artifacts, firstLayout)).toEqual([]);
    },
  );
});

function createArtifacts(
  types: readonly ArtifactType[],
  prefix = "artifact",
): WorkshopArtifact[] {
  return types.map((type, index) => ({
    id: `${prefix}-${index}`,
    type,
    title: `${type} ${index}`,
    content: `Generated ${type} artifact ${index}`,
    status: "draft",
    createdBy: "agent-quality",
    updatedAt: "2026-07-06T16:00:00.000Z",
    source: {
      participantId: "agent-quality",
    },
    tags: [],
  }));
}

function overlappingPairs(
  artifacts: readonly WorkshopArtifact[],
  positions: Record<string, ArtifactCanvasPosition>,
) {
  const pairs: string[] = [];

  for (let outer = 0; outer < artifacts.length; outer += 1) {
    for (let inner = outer + 1; inner < artifacts.length; inner += 1) {
      const first = artifacts[outer];
      const second = artifacts[inner];

      if (rectanglesOverlap(positions[first.id], positions[second.id])) {
        pairs.push(`${first.id}/${second.id}`);
      }
    }
  }

  return pairs;
}

function rectanglesOverlap(
  first: ArtifactCanvasPosition,
  second: ArtifactCanvasPosition,
) {
  const firstRight = first.x + artifactCanvasNodeBounds.width;
  const secondRight = second.x + artifactCanvasNodeBounds.width;
  const firstBottom = first.y + artifactCanvasNodeBounds.height;
  const secondBottom = second.y + artifactCanvasNodeBounds.height;

  return !(
    firstRight <= second.x ||
    secondRight <= first.x ||
    firstBottom <= second.y ||
    secondBottom <= first.y
  );
}
