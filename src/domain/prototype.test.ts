import { describe, expect, it } from "vitest";
import {
  addPrototypeVersion,
  calculatePrototypeCoverage,
  createPrototype,
  generatePrototypeFromWorkshop,
  getCurrentPrototypeVersion,
  prototypeToTraceabilityWorkItem,
  recordPrototypeFeedback,
  renderPrototypePreviewHtml,
  type PrototypeElement,
} from "./prototype";
import { buildTraceabilityGraph } from "./traceability";
import {
  createInitialWorkshopSession,
  participantIds,
  type WorkshopArtifact,
  type WorkshopSession,
} from "./workshop";

describe("prototype generation domain", () => {
  it("generates a versioned prototype from candidate and approved requirements", () => {
    const session = generatePrototypeFromWorkshop(requirementSession(), {
      title: "Alarm dashboard",
      actorId: participantIds.facilitator,
      at: "2026-07-06T10:00:00.000Z",
      sourceModel: {
        provider: "codex",
        model: "gpt-5.5",
        promptVersion: "prototype-generation-v1",
      },
    });

    const prototype = session.prototypes[0];
    expect(prototype).toMatchObject({
      id: "prototype-prototype-workshop-001",
      status: "generated",
      currentVersion: 1,
      createdAt: "2026-07-06T10:00:00.000Z",
    });

    const version = getCurrentPrototypeVersion(prototype);
    expect(version).toMatchObject({
      version: 1,
      generatedBy: participantIds.facilitator,
      sourceModel: {
        provider: "codex",
        model: "gpt-5.5",
        promptVersion: "prototype-generation-v1",
      },
    });
    expect(version.requirementRefs.map((ref) => ref.requirementId)).toEqual([
      "artifact-requirement-001",
      "artifact-requirement-002",
    ]);
    expect(version.coverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirementId: "artifact-requirement-001",
          status: "covered",
        }),
        expect.objectContaining({
          requirementId: "artifact-requirement-002",
          status: "covered",
        }),
      ]),
    );
  });

  it("adds explicit prototype versions instead of overwriting prior output", () => {
    const prototype = createPrototype(
      "prototype-workshop",
      [
        {
          requirementId: "requirement-1",
          title: "Status overview",
          statement: "Show alarm status in an overview dashboard.",
          state: "approved",
        },
      ],
      {
        prototypeId: "prototype-main",
        at: "2026-07-06T10:00:00.000Z",
      },
    );

    const updated = addPrototypeVersion(
      prototype,
      [
        ...getCurrentPrototypeVersion(prototype).requirementRefs,
        {
          requirementId: "requirement-2",
          title: "Risk flags",
          statement: "Show critical risk flags before dispatch.",
          state: "candidate",
        },
      ],
      {
        at: "2026-07-06T10:05:00.000Z",
      },
    );

    expect(updated.versions).toHaveLength(2);
    expect(updated.versions[0]).toMatchObject({
      version: 1,
      status: "superseded",
    });
    expect(getCurrentPrototypeVersion(updated)).toMatchObject({
      version: 2,
      generatedAt: "2026-07-06T10:05:00.000Z",
    });
  });

  it("escapes prototype content before rendering the sandbox document", () => {
    const prototype = createPrototype(
      "prototype-workshop",
      [
        {
          requirementId: "requirement-1",
          title: "Unsafe label",
          statement:
            "Show <img src=x onerror=alert(1)> and <script>x</script>.",
          state: "candidate",
        },
      ],
      {
        prototypeId: "prototype-sandbox",
      },
    );
    const version = getCurrentPrototypeVersion(prototype);
    const unsafeElement: PrototypeElement = {
      id: "unsafe-element",
      kind: "detail",
      title: "<script>alert(1)</script>",
      body: "<img src=x onerror=alert(1)>",
      requirementIds: ["requirement-1"],
      fields: [{ id: "field-1", label: "onload", value: "<script>" }],
      actions: ["<button onclick=alert(1)>Run</button>"],
    };

    const html = renderPrototypePreviewHtml({
      ...version,
      elements: [unsafeElement],
      coverage: calculatePrototypeCoverage(
        {
          ...version,
          elements: [unsafeElement],
        },
        version.requirementRefs,
      ),
    });

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<button");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("exports prototype coverage into traceability work items", () => {
    const session = generatePrototypeFromWorkshop(requirementSession(), {
      prototypeId: "prototype-alarm-review",
      at: "2026-07-06T10:00:00.000Z",
    });
    const prototype = session.prototypes[0];
    const graph = buildTraceabilityGraph(session, {
      workItems: [prototypeToTraceabilityWorkItem(prototype)],
    });

    expect(graph.warnings).toEqual([]);
    expect(graph.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceNodeId: "requirement:artifact-requirement-001",
          targetNodeId: "prototype:prototype-alarm-review",
          type: "covered-by",
          label: "prototyped by",
        }),
      ]),
    );
  });

  it("records human feedback as evidence and creates review artifacts without mutating approved requirements", () => {
    const generated = generatePrototypeFromWorkshop(requirementSession(), {
      prototypeId: "prototype-alarm-review",
      at: "2026-07-06T10:00:00.000Z",
    });
    const originalApproved = generated.artifacts.find(
      (artifact) => artifact.id === "artifact-requirement-001",
    );
    const version = getCurrentPrototypeVersion(generated.prototypes[0]);
    const element = version.elements.find(
      (candidate) =>
        candidate.kind !== "summary" &&
        candidate.requirementIds.includes("artifact-requirement-001"),
    );

    const next = recordPrototypeFeedback(
      generated,
      {
        prototypeId: "prototype-alarm-review",
        prototypeVersionId: version.id,
        elementId: element?.id,
        body: "Change this so stale data risk appears before dispatch.",
      },
      {
        actorId: participantIds.human,
        at: "2026-07-06T10:06:00.000Z",
      },
    );

    expect(
      next.artifacts.find(
        (artifact) => artifact.id === "artifact-requirement-001",
      ),
    ).toEqual(originalApproved);
    expect(next.prototypes[0].feedback[0]).toMatchObject({
      body: "Change this so stale data risk appears before dispatch.",
      intent: "change-request",
      evidence: {
        messageId: "message-002",
        sourceRequirementIds: ["artifact-requirement-001"],
      },
    });
    expect(next.artifacts.at(-1)).toMatchObject({
      type: "requirement",
      title: "Requirement change request: Alarm status overview",
      source: {
        messageId: "message-002",
        artifactId: "artifact-requirement-001",
        participantId: participantIds.human,
      },
      tags: expect.arrayContaining([
        "prototype-feedback",
        "change-request",
        "requires-review",
      ]),
    });
    expect(next.messages.at(-1)?.body).toBe(
      "Should this become a reviewed replacement requirement for Alarm status overview?",
    );

    const regenerated = generatePrototypeFromWorkshop(next, {
      at: "2026-07-06T10:08:00.000Z",
    });
    const regeneratedVersion = getCurrentPrototypeVersion(
      regenerated.prototypes[0],
    );

    expect(regeneratedVersion.version).toBe(2);
    expect(
      regeneratedVersion.requirementRefs.map(
        (requirement) => requirement.requirementId,
      ),
    ).toContain(next.artifacts.at(-1)?.id);
  });
});

function requirementSession(): WorkshopSession {
  const createdAt = "2026-07-06T09:50:00.000Z";

  return {
    ...createInitialWorkshopSession(createdAt, "prototype-workshop"),
    messages: [
      {
        id: "message-001",
        participantId: participantIds.human,
        kind: "human-input",
        body: "Operators need a dashboard for alarm status and risk flags.",
        createdAt,
        relatedArtifactIds: [
          "artifact-requirement-001",
          "artifact-requirement-002",
        ],
      },
    ],
    artifacts: [
      requirementArtifact({
        id: "artifact-requirement-001",
        title: "Alarm status overview",
        content: "Show alarm status in an overview dashboard.",
        status: "accepted",
      }),
      requirementArtifact({
        id: "artifact-requirement-002",
        title: "Critical risk flags",
        content: "Show critical risk flags before dispatch.",
        status: "draft",
      }),
    ],
    updatedAt: createdAt,
  };
}

function requirementArtifact(
  override: Pick<WorkshopArtifact, "id" | "title" | "content" | "status">,
): WorkshopArtifact {
  return {
    ...override,
    type: "requirement",
    createdBy: participantIds.quality,
    updatedAt: "2026-07-06T09:50:00.000Z",
    source: {
      messageId: "message-001",
      participantId: participantIds.human,
    },
    tags: ["test"],
  };
}
