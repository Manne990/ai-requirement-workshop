import { describe, expect, it } from "vitest";
import {
  applyCollaborationEvent,
  applyPresenceEvent,
  compareCollaborationEvents,
  createCollaborationEvent,
  createCollaborationProjection,
  createPresenceEvent,
  createPresenceState,
  describeCollaborationProjection,
  describePresenceSessions,
  listPresenceSessions,
  prunePresenceSessions,
  type CollaborationActor,
  type WorkshopPresenceSession,
} from "./collaboration";
import {
  createInitialWorkshopSession,
  submitHumanMessage,
  type WorkshopArtifact,
  type WorkshopMessage,
} from "./workshop";

const workshopId = "workshop-collab";
const actor: CollaborationActor = {
  participantId: "human-1",
  userId: "user-1",
  displayName: "Ada",
  type: "human",
};

describe("collaboration domain", () => {
  it("creates deterministic event ids from workshop, client session, and sequence", () => {
    const event = createCollaborationEvent({
      type: "message.added",
      workshopId,
      clientId: "client-a",
      clientSessionId: "session-a",
      sequence: 7,
      occurredAt: "2026-07-06T09:01:00.000Z",
      actor,
      payload: {
        message: message("message-2", "2026-07-06T09:01:00.000Z"),
      },
    });

    expect(event.id).toBe("event:workshop-collab:client-a:session-a:000007");
  });

  it("applies message, artifact, and metadata events in deterministic order", () => {
    const session = createInitialWorkshopSession(
      "2026-07-06T09:00:00.000Z",
      workshopId,
    );
    let projection = createCollaborationProjection(session);
    const laterMessage = message("message-later", "2026-07-06T09:03:00.000Z");
    const earlierMessage = message(
      "message-earlier",
      "2026-07-06T09:02:00.000Z",
    );
    const artifact = artifactDraft("artifact-1", "2026-07-06T09:04:00.000Z");

    projection = applyCollaborationEvent(
      projection,
      createCollaborationEvent({
        type: "message.added",
        workshopId,
        clientId: "client-a",
        clientSessionId: "session-a",
        sequence: 1,
        occurredAt: laterMessage.createdAt,
        actor,
        payload: { message: laterMessage },
      }),
    );
    projection = applyCollaborationEvent(
      projection,
      createCollaborationEvent({
        type: "message.added",
        workshopId,
        clientId: "client-b",
        clientSessionId: "session-b",
        sequence: 1,
        occurredAt: earlierMessage.createdAt,
        actor,
        payload: { message: earlierMessage },
      }),
    );
    projection = applyCollaborationEvent(
      projection,
      createCollaborationEvent({
        type: "artifact.added",
        workshopId,
        clientId: "client-a",
        clientSessionId: "session-a",
        sequence: 2,
        occurredAt: artifact.updatedAt,
        actor,
        payload: { artifact },
      }),
    );
    projection = applyCollaborationEvent(
      projection,
      createCollaborationEvent({
        type: "workshop.metadataUpdated",
        workshopId,
        clientId: "client-a",
        clientSessionId: "session-a",
        sequence: 3,
        occurredAt: "2026-07-06T09:05:00.000Z",
        actor,
        payload: {
          expectedRevision: 0,
          title: "Shared workshop",
          selectedArtifactId: artifact.id,
          activeWorkshopId: workshopId,
          visualizationMode: "requirements",
          updatedAt: "2026-07-06T09:05:00.000Z",
        },
      }),
    );

    expect(projection.session.messages.map((entry) => entry.id)).toEqual([
      "message-welcome",
      "message-earlier",
      "message-later",
    ]);
    expect(projection.session.artifacts.map((entry) => entry.id)).toEqual([
      "artifact-1",
    ]);
    expect(projection.session.title).toBe("Shared workshop");
    expect(projection.session.selectedArtifactId).toBe("artifact-1");
    expect(projection.session.visualizationMode).toBe("requirements");
    expect(projection.metadataRevision).toBe(1);
    expect(projection.provenance.map((entry) => entry.eventId)).toHaveLength(4);
  });

  it("records concurrent artifact status conflicts instead of overwriting", () => {
    const withArtifact = submitHumanMessage(
      createInitialWorkshopSession("2026-07-06T09:00:00.000Z", workshopId),
      "A handler needs a system that should flag missing documents.",
      "2026-07-06T09:01:00.000Z",
    );
    const artifact = withArtifact.artifacts.find(
      (candidate) => candidate.type === "requirement",
    );
    expect(artifact).toBeDefined();

    const accept = createCollaborationEvent({
      type: "artifact.statusChanged",
      workshopId,
      clientId: "client-a",
      clientSessionId: "session-a",
      sequence: 1,
      occurredAt: "2026-07-06T09:02:00.000Z",
      actor,
      payload: {
        artifactId: artifact?.id ?? "",
        status: "accepted",
        expectedRevision: 0,
        updatedAt: "2026-07-06T09:02:00.000Z",
      },
    });
    const reject = createCollaborationEvent({
      type: "artifact.statusChanged",
      workshopId,
      clientId: "client-b",
      clientSessionId: "session-b",
      sequence: 1,
      occurredAt: "2026-07-06T09:02:01.000Z",
      actor: { ...actor, userId: "user-2", displayName: "Grace" },
      payload: {
        artifactId: artifact?.id ?? "",
        status: "rejected",
        expectedRevision: 0,
        updatedAt: "2026-07-06T09:02:01.000Z",
      },
    });

    const projection = applyCollaborationEvent(
      applyCollaborationEvent(
        createCollaborationProjection(withArtifact),
        accept,
      ),
      reject,
    );

    const updated = projection.session.artifacts.find(
      (candidate) => candidate.id === artifact?.id,
    );
    expect(updated?.status).toBe("accepted");
    expect(projection.artifactRevisions[artifact?.id ?? ""]).toBe(1);
    expect(projection.conflicts).toEqual([
      expect.objectContaining({
        kind: "revision-conflict",
        targetType: "artifact",
        targetId: artifact?.id,
        expectedRevision: 0,
        actualRevision: 1,
        localValue: "accepted",
        incomingValue: "rejected",
      }),
    ]);
  });

  it("applies concurrent two-session status updates in deterministic order", () => {
    const artifact = artifactDraft(
      "artifact-concurrent",
      "2026-07-06T09:01:00.000Z",
    );
    const session = {
      ...createInitialWorkshopSession("2026-07-06T09:00:00.000Z", workshopId),
      artifacts: [artifact],
      selectedArtifactId: artifact.id,
      updatedAt: artifact.updatedAt,
    };
    const accept = createCollaborationEvent({
      type: "artifact.statusChanged",
      workshopId,
      clientId: "client-a",
      clientSessionId: "session-a",
      sequence: 2,
      occurredAt: "2026-07-06T09:02:00.000Z",
      actor,
      payload: {
        artifactId: artifact.id,
        status: "accepted",
        expectedRevision: 0,
        updatedAt: "2026-07-06T09:02:00.000Z",
      },
    });
    const reject = createCollaborationEvent({
      type: "artifact.statusChanged",
      workshopId,
      clientId: "client-b",
      clientSessionId: "session-b",
      sequence: 1,
      occurredAt: "2026-07-06T09:02:00.000Z",
      actor: { ...actor, participantId: "human-2", displayName: "Grace" },
      payload: {
        artifactId: artifact.id,
        status: "rejected",
        expectedRevision: 0,
        updatedAt: "2026-07-06T09:02:00.000Z",
      },
    });

    const orderedEvents = [reject, accept].sort(compareCollaborationEvents);
    const projection = orderedEvents.reduce(
      applyCollaborationEvent,
      createCollaborationProjection(session),
    );

    expect(orderedEvents.map((event) => event.id)).toEqual([
      "event:workshop-collab:client-a:session-a:000002",
      "event:workshop-collab:client-b:session-b:000001",
    ]);
    expect(
      projection.session.artifacts.find(
        (candidate) => candidate.id === artifact.id,
      )?.status,
    ).toBe("accepted");
    expect(projection.artifactRevisions[artifact.id]).toBe(1);
    expect(projection.conflicts).toEqual([
      expect.objectContaining({
        eventId: reject.id,
        kind: "revision-conflict",
        targetType: "artifact",
        targetId: artifact.id,
        expectedRevision: 0,
        actualRevision: 1,
        localValue: "accepted",
        incomingValue: "rejected",
      }),
    ]);
  });

  it("formats projection and presence diagnostics with revision and conflict context", () => {
    const artifact = artifactDraft(
      "artifact-diagnostic",
      "2026-07-06T09:01:00.000Z",
    );
    const session = {
      ...createInitialWorkshopSession("2026-07-06T09:00:00.000Z", workshopId),
      artifacts: [artifact],
    };
    let projection = createCollaborationProjection(session);
    const accept = createCollaborationEvent({
      type: "artifact.statusChanged",
      workshopId,
      clientId: "client-a",
      clientSessionId: "session-a",
      sequence: 1,
      occurredAt: "2026-07-06T09:02:00.000Z",
      actor,
      payload: {
        artifactId: artifact.id,
        status: "accepted",
        expectedRevision: 0,
        updatedAt: "2026-07-06T09:02:00.000Z",
      },
    });
    const reject = createCollaborationEvent({
      type: "artifact.statusChanged",
      workshopId,
      clientId: "client-b",
      clientSessionId: "session-b",
      sequence: 1,
      occurredAt: "2026-07-06T09:02:01.000Z",
      actor: { ...actor, participantId: "human-2", displayName: "Grace" },
      payload: {
        artifactId: artifact.id,
        status: "rejected",
        expectedRevision: 0,
        updatedAt: "2026-07-06T09:02:01.000Z",
      },
    });

    projection = applyCollaborationEvent(projection, accept);
    projection = applyCollaborationEvent(projection, reject);

    expect(JSON.parse(describeCollaborationProjection(projection))).toEqual(
      expect.objectContaining({
        artifacts: [
          expect.objectContaining({
            id: artifact.id,
            status: "accepted",
            revision: 1,
          }),
        ],
        conflicts: [
          expect.objectContaining({
            kind: "revision-conflict",
            targetId: artifact.id,
            localValue: "accepted",
            incomingValue: "rejected",
          }),
        ],
      }),
    );
    expect(
      JSON.parse(
        describePresenceSessions([
          presence("session-b", "Grace", "2026-07-06T09:00:00.000Z"),
          presence("session-a", "Ada", "2026-07-06T09:01:00.000Z"),
        ]),
      ),
    ).toEqual([
      expect.objectContaining({ sessionId: "session-a", displayName: "Ada" }),
      expect.objectContaining({
        sessionId: "session-b",
        displayName: "Grace",
      }),
    ]);
  });

  it("keeps presence deterministic across join, heartbeat, prune, and leave events", () => {
    let state = createPresenceState(workshopId);
    const grace = presence("session-b", "Grace", "2026-07-06T09:00:00.000Z");
    const ada = presence("session-a", "Ada", "2026-07-06T09:01:00.000Z");

    state = applyPresenceEvent(
      state,
      createPresenceEvent({
        type: "presence.joined",
        workshopId,
        clientId: "client-b",
        clientSessionId: "session-b",
        sequence: 1,
        occurredAt: grace.connectedAt,
        payload: { session: grace },
      }),
    );
    state = applyPresenceEvent(
      state,
      createPresenceEvent({
        type: "presence.joined",
        workshopId,
        clientId: "client-a",
        clientSessionId: "session-a",
        sequence: 1,
        occurredAt: ada.connectedAt,
        payload: { session: ada },
      }),
    );
    state = applyPresenceEvent(
      state,
      createPresenceEvent({
        type: "presence.heartbeat",
        workshopId,
        clientId: "client-a",
        clientSessionId: "session-a",
        sequence: 2,
        occurredAt: "2026-07-06T09:02:00.000Z",
        payload: {
          session: {
            ...ada,
            status: "idle",
            lastSeenAt: "2026-07-06T09:02:00.000Z",
          },
        },
      }),
    );

    expect(
      listPresenceSessions(state).map((session) => session.displayName),
    ).toEqual(["Ada", "Grace"]);
    expect(state.sessionsById["session-a"]?.status).toBe("idle");

    state = prunePresenceSessions(state, "2026-07-06T09:01:30.000Z");
    expect(
      listPresenceSessions(state).map((session) => session.sessionId),
    ).toEqual(["session-a"]);

    state = applyPresenceEvent(
      state,
      createPresenceEvent({
        type: "presence.left",
        workshopId,
        clientId: "client-a",
        clientSessionId: "session-a",
        sequence: 3,
        occurredAt: "2026-07-06T09:03:00.000Z",
        payload: {
          sessionId: "session-a",
          leftAt: "2026-07-06T09:03:00.000Z",
        },
      }),
    );

    expect(listPresenceSessions(state)).toEqual([]);
  });
});

function message(id: string, createdAt: string): WorkshopMessage {
  return {
    id,
    participantId: "human-1",
    kind: "human-input",
    body: `Message ${id}`,
    createdAt,
    relatedArtifactIds: [],
  };
}

function artifactDraft(id: string, updatedAt: string): WorkshopArtifact {
  return {
    id,
    type: "requirement",
    title: "Requirement",
    content: "The system should support realtime collaboration.",
    status: "draft",
    createdBy: "human-1",
    updatedAt,
    source: { participantId: "human-1" },
    tags: ["collaboration"],
  };
}

function presence(
  sessionId: string,
  displayName: string,
  connectedAt: string,
): WorkshopPresenceSession {
  return {
    workshopId,
    sessionId,
    clientId: sessionId.replace("session", "client"),
    participantId: "human-1",
    userId: sessionId.replace("session", "user"),
    displayName,
    status: "active",
    connectedAt,
    lastSeenAt: connectedAt,
  };
}
