import { describe, expect, it } from "vitest";
import {
  artifactLayoutMetrics,
  layoutArtifactPositions,
  routeArtifactEdge,
} from "./artifactLayout";
import type { ArtifactType, VisualizationMode } from "./workshop";

const artifactTypes: ArtifactType[] = [
  "source",
  "problem",
  "goal",
  "actor",
  "flow-step",
  "requirement",
  "risk",
  "assumption",
  "question",
  "decision",
];

describe("artifact layout", () => {
  it.each([
    "process",
    "requirements",
    "risks",
    "journey",
  ] as VisualizationMode[])(
    "places artifacts without overlapping in %s mode",
    (mode) => {
      const artifacts = [
        ...artifactTypes,
        ...artifactTypes,
        ...artifactTypes,
      ].map((type, index) => ({
        id: `artifact-${index}`,
        type,
      }));

      const positions = layoutArtifactPositions(artifacts, mode);
      const boxes = artifacts.map((artifact) => ({
        id: artifact.id,
        x: positions[artifact.id]?.x ?? 0,
        y: positions[artifact.id]?.y ?? 0,
        width: artifactLayoutMetrics.nodeWidth,
        height: artifactLayoutMetrics.nodeHeight,
      }));

      for (const source of boxes) {
        for (const target of boxes) {
          if (source.id === target.id) {
            continue;
          }

          expect(overlaps(source, target)).toBe(false);
        }
      }
    },
  );

  it("routes edges through vertical handles to avoid drawing through node bodies", () => {
    expect(routeArtifactEdge({ x: 0, y: 0 }, { x: 410, y: 0 })).toEqual({
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
    });
    expect(routeArtifactEdge({ x: 410, y: 274 }, { x: 0, y: 0 })).toEqual({
      sourceHandle: "source-top",
      targetHandle: "target-bottom",
    });
  });
});

function overlaps(
  source: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number; width: number; height: number },
) {
  return !(
    source.x + source.width <= target.x ||
    target.x + target.width <= source.x ||
    source.y + source.height <= target.y ||
    target.y + target.height <= source.y
  );
}
