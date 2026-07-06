import { describe, expect, it } from "vitest";
import { applyCodexWorkshopTurn } from "./codexWorkshop";
import {
  buildTraceabilityGraph,
  findTraceabilityCoverageGaps,
  getDownstreamImpact,
  getUpstreamImpact,
} from "./traceability";
import { createInitialWorkshopSession } from "./workshop";

describe("traceability graph", () => {
  it("models source messages and attachments as upstream evidence for artifacts", () => {
    const session = createTraceableSession();
    const graph = buildTraceabilityGraph(session);

    expect(graph.warnings).toEqual([]);
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "message:message-002",
          kind: "source-message",
        }),
        expect.objectContaining({
          id: "attachment:attachment-001",
          kind: "source-attachment",
        }),
        expect.objectContaining({
          id: "artifact:artifact-source-001",
          kind: "artifact",
          artifactType: "source",
        }),
        expect.objectContaining({
          id: "requirement:artifact-requirement-002",
          kind: "requirement",
        }),
        expect.objectContaining({
          id: "risk:artifact-risk-003",
          kind: "risk",
        }),
      ]),
    );
    expect(graph.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceNodeId: "message:message-002",
          targetNodeId: "attachment:attachment-001",
          type: "source-of",
        }),
        expect.objectContaining({
          sourceNodeId: "attachment:attachment-001",
          targetNodeId: "artifact:artifact-source-001",
          type: "source-of",
        }),
        expect.objectContaining({
          sourceNodeId: "message:message-002",
          targetNodeId: "requirement:artifact-requirement-002",
          type: "source-of",
        }),
      ]),
    );
  });

  it("queries downstream and upstream impact across tests and prototypes", () => {
    const graph = buildTraceabilityGraph(createTraceableSession(), {
      workItems: [
        {
          id: "freshness-test",
          kind: "test",
          title: "Data freshness contract test",
          covers: ["artifact-requirement-002"],
        },
        {
          id: "overview-prototype",
          kind: "prototype",
          title: "Alarm overview prototype",
          covers: ["artifact-requirement-002"],
        },
      ],
    });

    const downstream = getDownstreamImpact(graph, "message-002");
    const upstream = getUpstreamImpact(graph, "test:freshness-test");

    expect(downstream.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "requirement:artifact-requirement-002",
        "risk:artifact-risk-003",
        "test:freshness-test",
        "prototype:overview-prototype",
      ]),
    );
    expect(upstream.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "requirement:artifact-requirement-002",
        "message:message-002",
      ]),
    );
    expect(upstream.depthByNodeId["message:message-002"]).toBe(2);
  });

  it("reports requirement, risk, test, and prototype coverage gaps", () => {
    const graph = buildTraceabilityGraph(createTraceableSession(), {
      workItems: [
        {
          id: "freshness-test",
          kind: "test",
          title: "Data freshness contract test",
          covers: ["artifact-requirement-002"],
        },
        {
          id: "orphan-test",
          kind: "test",
          title: "Unlinked exploratory test",
        },
        {
          id: "orphan-prototype",
          kind: "prototype",
          title: "Unlinked click-through",
        },
      ],
    });

    const gaps = findTraceabilityCoverageGaps(graph);

    expect(gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expectationId: "risk-test",
          targetNodeId: "risk:artifact-risk-003",
        }),
        expect.objectContaining({
          expectationId: "test-target",
          targetNodeId: "test:orphan-test",
        }),
        expect.objectContaining({
          expectationId: "prototype-target",
          targetNodeId: "prototype:orphan-prototype",
        }),
      ]),
    );
    expect(
      gaps.some(
        (gap) =>
          gap.expectationId === "requirement-test" &&
          gap.targetNodeId === "requirement:artifact-requirement-002",
      ),
    ).toBe(false);
  });
});

function createTraceableSession() {
  return applyCodexWorkshopTurn(
    createInitialWorkshopSession("2026-07-06T09:00:00.000Z"),
    "SOS operators need an alarm dashboard with fresh customer status and critical risk flags.",
    {
      facilitatorMessage:
        "I captured the source and candidate requirements. Which alarms should be verified first?",
      artifacts: [
        {
          type: "requirement",
          title: "Fresh customer alarm status",
          content:
            "The dashboard should show customer alarm status no more than 60 seconds after ingestion.",
          createdBy: "agent-quality",
        },
        {
          type: "risk",
          title: "Stale operational data",
          content:
            "Delayed device data can cause operators to miss critical alarms.",
          createdBy: "agent-risk",
        },
      ],
    },
    [
      {
        name: "alarm-sources.csv",
        mimeType: "text/csv",
        size: 128,
        extractedText: "customer,device,last_seen",
        summary: "customer,device,last_seen",
        status: "extracted",
        tags: ["attachment", "file:csv"],
      },
    ],
    "2026-07-06T09:01:00.000Z",
  );
}
