import type {
  ArtifactStatus,
  VisualizationMode,
  WorkshopArtifact,
  WorkshopMessage,
  WorkshopSession,
} from "./workshop";

export type CollaborationActorType = "human" | "agent" | "facilitator";

export type CollaborationActor = {
  participantId: string;
  userId?: string;
  displayName: string;
  type: CollaborationActorType;
};

export type CollaborationEventEnvelope = {
  id: string;
  workshopId: string;
  clientId: string;
  clientSessionId: string;
  sequence: number;
  occurredAt: string;
  actor: CollaborationActor;
};

export type MessageAddedEvent = CollaborationEventEnvelope & {
  type: "message.added";
  payload: {
    message: WorkshopMessage;
  };
};

export type ArtifactAddedEvent = CollaborationEventEnvelope & {
  type: "artifact.added";
  payload: {
    artifact: WorkshopArtifact;
    revision?: number;
  };
};

export type ArtifactStatusChangedEvent = CollaborationEventEnvelope & {
  type: "artifact.statusChanged";
  payload: {
    artifactId: string;
    status: ArtifactStatus;
    expectedRevision: number;
    updatedAt: string;
  };
};

export type WorkshopMetadataPatch = {
  title?: string;
  selectedArtifactId?: string | null;
  visualizationMode?: VisualizationMode;
  followDiscussion?: boolean;
  activeWorkshopId?: string;
};

export type WorkshopMetadataUpdatedEvent = CollaborationEventEnvelope & {
  type: "workshop.metadataUpdated";
  payload: WorkshopMetadataPatch & {
    expectedRevision: number;
    updatedAt: string;
  };
};

export type WorkshopCollaborationEvent =
  | MessageAddedEvent
  | ArtifactAddedEvent
  | ArtifactStatusChangedEvent
  | WorkshopMetadataUpdatedEvent;

export type CreateCollaborationEventInput = Omit<
  WorkshopCollaborationEvent,
  "id" | keyof CollaborationEventEnvelope
> &
  Omit<CollaborationEventEnvelope, "id"> & {
    id?: string;
  };

export type PresenceStatus = "active" | "idle" | "away";

export type WorkshopPresenceSession = {
  workshopId: string;
  sessionId: string;
  clientId: string;
  participantId: string;
  userId?: string;
  displayName: string;
  status: PresenceStatus;
  connectedAt: string;
  lastSeenAt: string;
};

export type PresenceEventEnvelope = {
  id: string;
  workshopId: string;
  clientId: string;
  clientSessionId: string;
  sequence: number;
  occurredAt: string;
};

export type PresenceJoinedEvent = PresenceEventEnvelope & {
  type: "presence.joined";
  payload: {
    session: WorkshopPresenceSession;
  };
};

export type PresenceHeartbeatEvent = PresenceEventEnvelope & {
  type: "presence.heartbeat";
  payload: {
    session: WorkshopPresenceSession;
  };
};

export type PresenceLeftEvent = PresenceEventEnvelope & {
  type: "presence.left";
  payload: {
    sessionId: string;
    leftAt: string;
  };
};

export type WorkshopPresenceEvent =
  PresenceJoinedEvent | PresenceHeartbeatEvent | PresenceLeftEvent;

export type CreatePresenceEventInput = Omit<
  WorkshopPresenceEvent,
  "id" | keyof PresenceEventEnvelope
> &
  Omit<PresenceEventEnvelope, "id"> & {
    id?: string;
  };

export type WorkshopPresenceState = {
  workshopId: string;
  sessionsById: Record<string, WorkshopPresenceSession>;
  appliedEventIds: string[];
};

export type CollaborationConflictKind =
  "duplicate-id" | "missing-target" | "revision-conflict" | "workshop-mismatch";

export type CollaborationConflict = {
  id: string;
  eventId: string;
  kind: CollaborationConflictKind;
  targetType: "artifact" | "message" | "workshop";
  targetId: string;
  expectedRevision?: number;
  actualRevision?: number;
  localValue?: unknown;
  incomingValue?: unknown;
  detectedAt: string;
};

export type CollaborationProvenance = {
  eventId: string;
  actor: CollaborationActor;
  targetType: "artifact" | "message" | "workshop";
  targetId: string;
  revision?: number;
  changedAt: string;
};

export type CollaborationProjection = {
  session: WorkshopSession;
  activeWorkshopId: string;
  artifactRevisions: Record<string, number>;
  metadataRevision: number;
  appliedEventIds: string[];
  conflicts: CollaborationConflict[];
  provenance: CollaborationProvenance[];
};

export function createCollaborationEvent(
  input: CreateCollaborationEventInput,
): WorkshopCollaborationEvent {
  return {
    ...input,
    id: input.id ?? createEventId("event", input),
  } as WorkshopCollaborationEvent;
}

export function createPresenceEvent(
  input: CreatePresenceEventInput,
): WorkshopPresenceEvent {
  return {
    ...input,
    id: input.id ?? createEventId("presence", input),
  } as WorkshopPresenceEvent;
}

export function createCollaborationProjection(
  session: WorkshopSession,
  options: {
    activeWorkshopId?: string;
    artifactRevisions?: Record<string, number>;
    metadataRevision?: number;
  } = {},
): CollaborationProjection {
  const artifactRevisions = { ...options.artifactRevisions };
  for (const artifact of session.artifacts) {
    artifactRevisions[artifact.id] ??= 0;
  }

  return {
    session,
    activeWorkshopId: options.activeWorkshopId ?? session.id,
    artifactRevisions,
    metadataRevision: options.metadataRevision ?? 0,
    appliedEventIds: [],
    conflicts: [],
    provenance: [],
  };
}

export function applyCollaborationEvent(
  projection: CollaborationProjection,
  event: WorkshopCollaborationEvent,
): CollaborationProjection {
  if (projection.appliedEventIds.includes(event.id)) {
    return projection;
  }

  if (event.workshopId !== projection.session.id) {
    return withConflict(projection, event, {
      kind: "workshop-mismatch",
      targetType: "workshop",
      targetId: projection.session.id,
      localValue: projection.session.id,
      incomingValue: event.workshopId,
    });
  }

  switch (event.type) {
    case "message.added":
      return applyMessageAdded(projection, event);
    case "artifact.added":
      return applyArtifactAdded(projection, event);
    case "artifact.statusChanged":
      return applyArtifactStatusChanged(projection, event);
    case "workshop.metadataUpdated":
      return applyWorkshopMetadataUpdated(projection, event);
  }
}

export function compareCollaborationEvents(
  left: WorkshopCollaborationEvent,
  right: WorkshopCollaborationEvent,
) {
  return (
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.clientId.localeCompare(right.clientId) ||
    left.clientSessionId.localeCompare(right.clientSessionId) ||
    left.sequence - right.sequence ||
    left.id.localeCompare(right.id)
  );
}

export function createPresenceState(workshopId: string): WorkshopPresenceState {
  return {
    workshopId,
    sessionsById: {},
    appliedEventIds: [],
  };
}

export function applyPresenceEvent(
  state: WorkshopPresenceState,
  event: WorkshopPresenceEvent,
): WorkshopPresenceState {
  if (
    state.appliedEventIds.includes(event.id) ||
    event.workshopId !== state.workshopId
  ) {
    return state;
  }

  if (event.type === "presence.left") {
    const existing = state.sessionsById[event.payload.sessionId];
    if (!existing || event.payload.leftAt < existing.connectedAt) {
      return withAppliedPresenceEvent(state, event.id);
    }

    const { [event.payload.sessionId]: _removed, ...sessionsById } =
      state.sessionsById;
    return {
      ...state,
      sessionsById,
      appliedEventIds: [...state.appliedEventIds, event.id],
    };
  }

  const incoming = event.payload.session;
  const existing = state.sessionsById[incoming.sessionId];
  if (existing && incoming.lastSeenAt < existing.lastSeenAt) {
    return withAppliedPresenceEvent(state, event.id);
  }

  return {
    ...state,
    sessionsById: {
      ...state.sessionsById,
      [incoming.sessionId]: incoming,
    },
    appliedEventIds: [...state.appliedEventIds, event.id],
  };
}

export function listPresenceSessions(
  state: WorkshopPresenceState,
): WorkshopPresenceSession[] {
  return Object.values(state.sessionsById).sort(comparePresenceSessions);
}

export function prunePresenceSessions(
  state: WorkshopPresenceState,
  staleBefore: string,
): WorkshopPresenceState {
  return {
    ...state,
    sessionsById: Object.fromEntries(
      Object.entries(state.sessionsById).filter(
        ([, session]) => session.lastSeenAt >= staleBefore,
      ),
    ),
  };
}

function applyMessageAdded(
  projection: CollaborationProjection,
  event: MessageAddedEvent,
): CollaborationProjection {
  const incoming = event.payload.message;
  const existing = projection.session.messages.find(
    (message) => message.id === incoming.id,
  );
  if (existing) {
    if (sameJson(existing, incoming)) {
      return withAppliedEvent(projection, event);
    }

    return withConflict(projection, event, {
      kind: "duplicate-id",
      targetType: "message",
      targetId: incoming.id,
      localValue: existing,
      incomingValue: incoming,
    });
  }

  return withAppliedEvent(
    {
      ...projection,
      session: {
        ...projection.session,
        messages: [...projection.session.messages, incoming].sort(
          compareMessages,
        ),
        updatedAt: maxIso(projection.session.updatedAt, incoming.createdAt),
      },
    },
    event,
    {
      targetType: "message",
      targetId: incoming.id,
      changedAt: incoming.createdAt,
    },
  );
}

function applyArtifactAdded(
  projection: CollaborationProjection,
  event: ArtifactAddedEvent,
): CollaborationProjection {
  const incoming = event.payload.artifact;
  const existing = projection.session.artifacts.find(
    (artifact) => artifact.id === incoming.id,
  );
  if (existing) {
    if (sameJson(existing, incoming)) {
      return withAppliedEvent(projection, event);
    }

    return withConflict(projection, event, {
      kind: "duplicate-id",
      targetType: "artifact",
      targetId: incoming.id,
      localValue: existing,
      incomingValue: incoming,
    });
  }

  const revision = event.payload.revision ?? 0;
  return withAppliedEvent(
    {
      ...projection,
      session: {
        ...projection.session,
        artifacts: [...projection.session.artifacts, incoming].sort(
          compareArtifacts,
        ),
        updatedAt: maxIso(projection.session.updatedAt, incoming.updatedAt),
      },
      artifactRevisions: {
        ...projection.artifactRevisions,
        [incoming.id]: revision,
      },
    },
    event,
    {
      targetType: "artifact",
      targetId: incoming.id,
      revision,
      changedAt: incoming.updatedAt,
    },
  );
}

function applyArtifactStatusChanged(
  projection: CollaborationProjection,
  event: ArtifactStatusChangedEvent,
): CollaborationProjection {
  const { artifactId, expectedRevision, status, updatedAt } = event.payload;
  const artifact = projection.session.artifacts.find(
    (candidate) => candidate.id === artifactId,
  );
  if (!artifact) {
    return withConflict(projection, event, {
      kind: "missing-target",
      targetType: "artifact",
      targetId: artifactId,
      expectedRevision,
      actualRevision: undefined,
      incomingValue: status,
    });
  }

  const actualRevision = projection.artifactRevisions[artifactId] ?? 0;
  if (actualRevision !== expectedRevision) {
    return withConflict(projection, event, {
      kind: "revision-conflict",
      targetType: "artifact",
      targetId: artifactId,
      expectedRevision,
      actualRevision,
      localValue: artifact.status,
      incomingValue: status,
    });
  }

  const nextRevision = actualRevision + 1;
  return withAppliedEvent(
    {
      ...projection,
      session: {
        ...projection.session,
        artifacts: projection.session.artifacts.map((candidate) =>
          candidate.id === artifactId
            ? { ...candidate, status, updatedAt }
            : candidate,
        ),
        updatedAt: maxIso(projection.session.updatedAt, updatedAt),
      },
      artifactRevisions: {
        ...projection.artifactRevisions,
        [artifactId]: nextRevision,
      },
    },
    event,
    {
      targetType: "artifact",
      targetId: artifactId,
      revision: nextRevision,
      changedAt: updatedAt,
    },
  );
}

function applyWorkshopMetadataUpdated(
  projection: CollaborationProjection,
  event: WorkshopMetadataUpdatedEvent,
): CollaborationProjection {
  const { expectedRevision, updatedAt } = event.payload;
  if (projection.metadataRevision !== expectedRevision) {
    return withConflict(projection, event, {
      kind: "revision-conflict",
      targetType: "workshop",
      targetId: projection.session.id,
      expectedRevision,
      actualRevision: projection.metadataRevision,
      incomingValue: metadataPatchValue(event.payload),
    });
  }

  const nextSession = {
    ...projection.session,
    ...(event.payload.title === undefined
      ? {}
      : { title: event.payload.title }),
    ...(event.payload.selectedArtifactId === undefined
      ? {}
      : { selectedArtifactId: event.payload.selectedArtifactId ?? undefined }),
    ...(event.payload.visualizationMode === undefined
      ? {}
      : { visualizationMode: event.payload.visualizationMode }),
    ...(event.payload.followDiscussion === undefined
      ? {}
      : { followDiscussion: event.payload.followDiscussion }),
    updatedAt: maxIso(projection.session.updatedAt, updatedAt),
  };

  return withAppliedEvent(
    {
      ...projection,
      session: nextSession,
      activeWorkshopId:
        event.payload.activeWorkshopId ?? projection.activeWorkshopId,
      metadataRevision: projection.metadataRevision + 1,
    },
    event,
    {
      targetType: "workshop",
      targetId: projection.session.id,
      revision: projection.metadataRevision + 1,
      changedAt: updatedAt,
    },
  );
}

function withConflict(
  projection: CollaborationProjection,
  event: WorkshopCollaborationEvent,
  conflict: Omit<CollaborationConflict, "id" | "eventId" | "detectedAt">,
): CollaborationProjection {
  return {
    ...projection,
    appliedEventIds: [...projection.appliedEventIds, event.id],
    conflicts: [
      ...projection.conflicts,
      {
        ...conflict,
        id: `${event.id}:conflict-${pad(projection.conflicts.length + 1)}`,
        eventId: event.id,
        detectedAt: event.occurredAt,
      },
    ],
  };
}

function withAppliedEvent(
  projection: CollaborationProjection,
  event: WorkshopCollaborationEvent,
  provenance?: Omit<CollaborationProvenance, "eventId" | "actor">,
): CollaborationProjection {
  return {
    ...projection,
    appliedEventIds: [...projection.appliedEventIds, event.id],
    provenance: provenance
      ? [
          ...projection.provenance,
          {
            ...provenance,
            eventId: event.id,
            actor: event.actor,
          },
        ]
      : projection.provenance,
  };
}

function withAppliedPresenceEvent(
  state: WorkshopPresenceState,
  eventId: string,
): WorkshopPresenceState {
  return {
    ...state,
    appliedEventIds: [...state.appliedEventIds, eventId],
  };
}

function createEventId(
  prefix: string,
  input: Pick<
    CollaborationEventEnvelope,
    "workshopId" | "clientId" | "clientSessionId" | "sequence"
  >,
) {
  return [
    prefix,
    safeIdSegment(input.workshopId),
    safeIdSegment(input.clientId),
    safeIdSegment(input.clientSessionId),
    pad(input.sequence),
  ].join(":");
}

function metadataPatchValue(
  patch: WorkshopMetadataUpdatedEvent["payload"],
): WorkshopMetadataPatch {
  return {
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.selectedArtifactId === undefined
      ? {}
      : { selectedArtifactId: patch.selectedArtifactId }),
    ...(patch.visualizationMode === undefined
      ? {}
      : { visualizationMode: patch.visualizationMode }),
    ...(patch.followDiscussion === undefined
      ? {}
      : { followDiscussion: patch.followDiscussion }),
    ...(patch.activeWorkshopId === undefined
      ? {}
      : { activeWorkshopId: patch.activeWorkshopId }),
  };
}

function compareMessages(left: WorkshopMessage, right: WorkshopMessage) {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.participantId.localeCompare(right.participantId) ||
    left.id.localeCompare(right.id)
  );
}

function compareArtifacts(left: WorkshopArtifact, right: WorkshopArtifact) {
  return (
    left.updatedAt.localeCompare(right.updatedAt) ||
    left.createdBy.localeCompare(right.createdBy) ||
    left.id.localeCompare(right.id)
  );
}

function comparePresenceSessions(
  left: WorkshopPresenceSession,
  right: WorkshopPresenceSession,
) {
  return (
    left.displayName.localeCompare(right.displayName) ||
    left.participantId.localeCompare(right.participantId) ||
    left.sessionId.localeCompare(right.sessionId)
  );
}

function maxIso(left: string, right: string) {
  return left >= right ? left : right;
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safeIdSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function pad(sequence: number) {
  return sequence.toString().padStart(6, "0");
}
