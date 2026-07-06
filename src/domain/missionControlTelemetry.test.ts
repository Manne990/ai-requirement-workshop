import { describe, expect, it } from "vitest";
import {
  buildWorkshopKpiSnapshot,
  createAuthBoundaryTelemetry,
  createConsolidationAppliedTelemetry,
  createMessageSentTelemetry,
  createPrototypeGeneratedTelemetry,
  createRequirementApprovedTelemetry,
  createWorkshopOpenedTelemetry,
  missionControlProductId,
  missionControlTelemetryEventNames,
  type MissionControlTelemetrySource,
} from "./missionControlTelemetry";
import {
  createInitialWorkshopSession,
  submitHumanMessage,
  updateArtifactStatus,
} from "./workshop";

const source: MissionControlTelemetrySource = {
  product: missionControlProductId,
  surface: "workshop-room",
  trigger: "user",
  runtime: "test",
  component: "mission-control-telemetry.test",
};

describe("Mission Control telemetry", () => {
  it("describes workshop-opened events with source, provenance, and KPI snapshot payloads", () => {
    const session = createInitialWorkshopSession(
      "2026-07-01T10:00:00.000Z",
      "workshop-demo",
    );

    const event = createWorkshopOpenedTelemetry(session, {
      occurredAt: "2026-07-01T10:00:01.000Z",
      source,
      correlationId: "run-37",
    });

    expect(event.name).toBe(missionControlTelemetryEventNames.workshopOpened);
    expect(event.product).toBe("ai-requirement-workshop");
    expect(event.source).toEqual(source);
    expect(event.provenance).toMatchObject({
      workshopId: "workshop-demo",
      workshopTitle: "AI Requirement Workshop",
      correlationId: "run-37",
    });
    expect(event.payload).toMatchObject({
      title: "AI Requirement Workshop",
      messageCount: 1,
      artifactCount: 0,
      attachmentCount: 0,
      visualizationMode: "process",
      followDiscussion: true,
    });
    expect(event.kpis.map((kpi) => kpi.name)).toEqual(
      expect.arrayContaining([
        "workshops.opened",
        "workshop.messages.total",
        "workshop.artifacts.total",
        "workshop.requirements.approved.total",
      ]),
    );
  });

  it("records message-sent payloads without copying message body text", () => {
    const session = submitHumanMessage(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z", "workshop-demo"),
      "A case handler needs a system that should show missing requirements.",
      "2026-07-01T10:01:00.000Z",
    );
    const message = session.messages.find(
      (candidate) => candidate.kind === "human-input",
    );
    expect(message).toBeDefined();

    const event = createMessageSentTelemetry(session, message!, {
      occurredAt: "2026-07-01T10:01:01.000Z",
      source: { ...source, surface: "chat" },
    });

    expect(event.name).toBe(missionControlTelemetryEventNames.messageSent);
    expect(event.payload).toEqual({
      messageId: message?.id,
      kind: "human-input",
      participantId: "human-1",
      bodyLength: message?.body.length,
      relatedArtifactIds: message?.relatedArtifactIds,
      relatedArtifactCount: message?.relatedArtifactIds.length,
    });
    expect(JSON.stringify(event.payload)).not.toContain("case handler");
    expect(event.provenance.sourceRefs?.length).toBeGreaterThan(0);
    expect(event.kpis).toContainEqual(
      expect.objectContaining({
        name: "messages.sent",
        value: 1,
        labels: { kind: "human-input" },
      }),
    );
  });

  it("captures approved requirement provenance back to the source message", () => {
    const drafted = submitHumanMessage(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z", "workshop-demo"),
      "The future solution should notify coordinators about overdue approvals.",
      "2026-07-01T10:01:00.000Z",
    );
    const draftRequirement = drafted.artifacts.find(
      (artifact) => artifact.type === "requirement",
    );
    expect(draftRequirement).toBeDefined();

    const approved = updateArtifactStatus(
      drafted,
      draftRequirement!.id,
      "accepted",
      "2026-07-01T10:02:00.000Z",
    );
    const requirement = approved.artifacts.find(
      (artifact) => artifact.id === draftRequirement?.id,
    );
    expect(requirement).toBeDefined();

    const event = createRequirementApprovedTelemetry(approved, requirement!, {
      occurredAt: "2026-07-01T10:02:01.000Z",
      source: { ...source, surface: "canvas" },
      previousStatus: "draft",
    });

    expect(event.name).toBe(
      missionControlTelemetryEventNames.requirementApproved,
    );
    expect(event.payload).toMatchObject({
      requirementId: requirement?.id,
      previousStatus: "draft",
      status: "accepted",
      sourceRef: requirement?.source,
    });
    expect(event.provenance).toMatchObject({
      workshopId: "workshop-demo",
      requirementId: requirement?.id,
      sourceMessageId: requirement?.source.messageId,
    });
    expect(
      event.kpis.find(
        (kpi) => kpi.name === "workshop.requirements.approved.total",
      )?.value,
    ).toBe(1);
  });

  it("defines consolidation and prototype payloads with artifact lineage", () => {
    const session = submitHumanMessage(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z", "workshop-demo"),
      "The app should consolidate open questions into approved requirements.",
      "2026-07-01T10:01:00.000Z",
    );
    const artifactIds = session.artifacts
      .slice(0, 2)
      .map((artifact) => artifact.id);
    const requirementIds = session.artifacts
      .filter((artifact) => artifact.type === "requirement")
      .map((artifact) => artifact.id);

    const consolidation = createConsolidationAppliedTelemetry(
      session,
      {
        consolidationId: "consolidation-001",
        inputArtifactIds: artifactIds,
        outputArtifactIds: requirementIds,
        approvedRequirementIds: requirementIds,
        summaryLength: 128,
      },
      {
        occurredAt: "2026-07-01T10:03:00.000Z",
        source: { ...source, surface: "canvas", trigger: "system" },
      },
    );
    const prototype = createPrototypeGeneratedTelemetry(
      session,
      {
        prototypeId: "prototype-001",
        format: "react",
        sourceArtifactIds: artifactIds,
        requirementIds,
        targetSurface: "workshop-preview",
      },
      {
        occurredAt: "2026-07-01T10:04:00.000Z",
        source: { ...source, surface: "codex-bridge", trigger: "codex" },
      },
    );

    expect(consolidation.name).toBe(
      missionControlTelemetryEventNames.consolidationApplied,
    );
    expect(consolidation.provenance.artifactIds).toEqual([
      ...artifactIds,
      ...requirementIds,
    ]);
    expect(consolidation.kpis).toContainEqual(
      expect.objectContaining({ name: "consolidations.applied", value: 1 }),
    );
    expect(prototype.name).toBe(
      missionControlTelemetryEventNames.prototypeGenerated,
    );
    expect(prototype.payload).toMatchObject({
      prototypeId: "prototype-001",
      format: "react",
      requirementIds,
    });
    expect(prototype.kpis).toContainEqual(
      expect.objectContaining({
        name: "prototypes.generated",
        value: 1,
        labels: { format: "react" },
      }),
    );
  });

  it("defines provider-neutral auth boundary telemetry", () => {
    const event = createAuthBoundaryTelemetry(
      {
        boundary: "codex-local-endpoint",
        event: "denied",
        provider: "openai",
        reason: "missing-token",
      },
      {
        occurredAt: "2026-07-01T10:05:00.000Z",
        source: {
          product: missionControlProductId,
          surface: "auth-boundary",
          trigger: "system",
          runtime: "vite",
        },
        provenance: {
          workshopId: "workshop-demo",
          correlationId: "run-37",
        },
      },
    );

    expect(event.name).toBe(missionControlTelemetryEventNames.authBoundary);
    expect(event.payload).toEqual({
      boundary: "codex-local-endpoint",
      event: "denied",
      provider: "openai",
      reason: "missing-token",
    });
    expect(event.provenance).toMatchObject({
      workshopId: "workshop-demo",
      correlationId: "run-37",
    });
    expect(event.kpis).toContainEqual(
      expect.objectContaining({
        name: "auth.boundary.events",
        labels: {
          boundary: "codex-local-endpoint",
          event: "denied",
        },
      }),
    );
  });

  it("builds a standalone workshop KPI snapshot", () => {
    const session = submitHumanMessage(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z", "workshop-demo"),
      "The future solution should show the source for every requirement.",
      "2026-07-01T10:01:00.000Z",
    );

    const snapshot = buildWorkshopKpiSnapshot(
      session,
      "2026-07-01T10:06:00.000Z",
      source,
    );

    expect(snapshot).toContainEqual(
      expect.objectContaining({
        name: "workshop.messages.total",
        value: session.messages.length,
        source,
        provenance: expect.objectContaining({ workshopId: "workshop-demo" }),
      }),
    );
    expect(snapshot).toContainEqual(
      expect.objectContaining({
        name: "workshop.artifacts.total",
        value: session.artifacts.length,
      }),
    );
  });
});
