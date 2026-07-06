import {
  type SourceRef,
  type WorkshopArtifact,
  type WorkshopMessage,
  type WorkshopSession,
} from "./workshop";

export const missionControlTelemetrySchemaVersion =
  "mission-control.telemetry.v1";

export const missionControlProductId = "ai-requirement-workshop";

export const missionControlTelemetryEventNames = {
  workshopOpened: "workshop.opened",
  messageSent: "message.sent",
  requirementApproved: "requirement.approved",
  requirementBaselined: "requirement.baselined",
  requirementRejected: "requirement.rejected",
  requirementSuperseded: "requirement.superseded",
  consolidationApplied: "consolidation.applied",
  consolidationParked: "consolidation.parked",
  prototypeGenerated: "prototype.generated",
  authBoundary: "auth.boundary",
} as const;

export type MissionControlTelemetryEventName =
  (typeof missionControlTelemetryEventNames)[keyof typeof missionControlTelemetryEventNames];

export type MissionControlTelemetryTrigger =
  "user" | "system" | "codex" | "restore";

export type MissionControlTelemetryRuntime =
  "browser" | "vite" | "test" | "unknown";

export type MissionControlTelemetrySurface =
  | "workshop-room"
  | "canvas"
  | "chat"
  | "codex-bridge"
  | "report-export"
  | "auth-boundary"
  | "persistence";

export type MissionControlTelemetrySource = {
  product: typeof missionControlProductId;
  surface: MissionControlTelemetrySurface;
  trigger: MissionControlTelemetryTrigger;
  runtime: MissionControlTelemetryRuntime;
  component?: string;
};

export type MissionControlTelemetryProvenance = {
  workshopId?: string;
  workshopTitle?: string;
  recordId?: string;
  participantId?: string;
  messageId?: string;
  artifactId?: string;
  artifactIds?: string[];
  requirementId?: string;
  requirementIds?: string[];
  attachmentIds?: string[];
  sourceMessageId?: string;
  sourceArtifactId?: string;
  sourceRefs?: SourceRef[];
  causationEventId?: string;
  correlationId?: string;
};

export type WorkshopOpenedPayload = {
  title: string;
  messageCount: number;
  artifactCount: number;
  attachmentCount: number;
  visualizationMode: WorkshopSession["visualizationMode"];
  followDiscussion: boolean;
};

export type MessageSentPayload = {
  messageId: string;
  kind: WorkshopMessage["kind"];
  participantId: string;
  bodyLength: number;
  relatedArtifactIds: string[];
  relatedArtifactCount: number;
};

export type RequirementApprovedPayload = {
  requirementId: string;
  title: string;
  previousStatus?: WorkshopArtifact["status"];
  status: "accepted";
  lifecycle: "approved";
  sourceRef: SourceRef;
  tagCount: number;
};

export type RequirementLifecyclePayload = {
  requirementId: string;
  title: string;
  previousStatus?: WorkshopArtifact["status"];
  status: WorkshopArtifact["status"];
  lifecycle: "approved" | "baselined" | "rejected" | "superseded";
  sourceRef: SourceRef;
  tagCount: number;
};

export type ConsolidationAppliedPayload = {
  consolidationId: string;
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  approvedRequirementIds: string[];
  summaryLength?: number;
};

export type PrototypeGeneratedFormat =
  "markdown" | "html" | "react" | "image" | "figma" | "other";

export type PrototypeGeneratedPayload = {
  prototypeId: string;
  format: PrototypeGeneratedFormat;
  sourceArtifactIds: string[];
  requirementIds: string[];
  targetSurface?: string;
};

export type AuthBoundaryName =
  "codex-local-endpoint" | "disk-backup" | "remote-api" | "unknown";

export type AuthBoundaryEvent =
  "requested" | "granted" | "denied" | "expired" | "cleared" | "failed";

export type AuthBoundaryPayload = {
  boundary: AuthBoundaryName;
  event: AuthBoundaryEvent;
  provider?: "codex" | "openai" | "local" | "unknown";
  reason?: string;
};

export type MissionControlTelemetryPayloadByName = {
  [missionControlTelemetryEventNames.workshopOpened]: WorkshopOpenedPayload;
  [missionControlTelemetryEventNames.messageSent]: MessageSentPayload;
  [missionControlTelemetryEventNames.requirementApproved]: RequirementApprovedPayload;
  [missionControlTelemetryEventNames.requirementBaselined]: RequirementLifecyclePayload;
  [missionControlTelemetryEventNames.requirementRejected]: RequirementLifecyclePayload;
  [missionControlTelemetryEventNames.requirementSuperseded]: RequirementLifecyclePayload;
  [missionControlTelemetryEventNames.consolidationApplied]: ConsolidationAppliedPayload;
  [missionControlTelemetryEventNames.consolidationParked]: ConsolidationAppliedPayload;
  [missionControlTelemetryEventNames.prototypeGenerated]: PrototypeGeneratedPayload;
  [missionControlTelemetryEventNames.authBoundary]: AuthBoundaryPayload;
};

export type MissionControlKpiName =
  | "workshops.opened"
  | "messages.sent"
  | "requirements.approved"
  | "requirements.baselined"
  | "requirements.rejected"
  | "requirements.superseded"
  | "consolidations.applied"
  | "consolidations.parked"
  | "prototypes.generated"
  | "auth.boundary.events"
  | "workshop.messages.total"
  | "workshop.artifacts.total"
  | "workshop.attachments.total"
  | "workshop.sources.total"
  | "workshop.requirements.approved.total"
  | "workshop.unresolved.total";

export type MissionControlKpiUnit = "count";

export type MissionControlKpiPayload = {
  schemaVersion: typeof missionControlTelemetrySchemaVersion;
  product: typeof missionControlProductId;
  name: MissionControlKpiName;
  value: number;
  unit: MissionControlKpiUnit;
  observedAt: string;
  source: MissionControlTelemetrySource;
  provenance: MissionControlTelemetryProvenance;
  labels?: Record<string, string | number | boolean>;
};

export type MissionControlTelemetryEvent<
  TName extends MissionControlTelemetryEventName =
    MissionControlTelemetryEventName,
> = {
  schemaVersion: typeof missionControlTelemetrySchemaVersion;
  product: typeof missionControlProductId;
  eventId: string;
  name: TName;
  occurredAt: string;
  source: MissionControlTelemetrySource;
  provenance: MissionControlTelemetryProvenance;
  payload: MissionControlTelemetryPayloadByName[TName];
  kpis: MissionControlKpiPayload[];
};

type EventOptions = {
  occurredAt: string;
  source: MissionControlTelemetrySource;
  causationEventId?: string;
  correlationId?: string;
  recordId?: string;
};

export function createWorkshopOpenedTelemetry(
  session: WorkshopSession,
  options: EventOptions,
): MissionControlTelemetryEvent<
  typeof missionControlTelemetryEventNames.workshopOpened
> {
  const provenance = sessionProvenance(session, options);
  const payload: WorkshopOpenedPayload = {
    title: session.title,
    messageCount: session.messages.length,
    artifactCount: session.artifacts.length,
    attachmentCount: session.attachments.length,
    visualizationMode: session.visualizationMode,
    followDiscussion: session.followDiscussion,
  };

  return createTelemetryEvent(
    missionControlTelemetryEventNames.workshopOpened,
    payload,
    provenance,
    options,
    [
      createMissionControlKpi(
        "workshops.opened",
        1,
        options.occurredAt,
        options.source,
        provenance,
      ),
      ...buildWorkshopKpiSnapshot(session, options.occurredAt, options.source),
    ],
  );
}

export function createMessageSentTelemetry(
  session: WorkshopSession,
  message: WorkshopMessage,
  options: EventOptions,
): MissionControlTelemetryEvent<
  typeof missionControlTelemetryEventNames.messageSent
> {
  const relatedArtifacts = session.artifacts.filter((artifact) =>
    message.relatedArtifactIds.includes(artifact.id),
  );
  const provenance = sessionProvenance(session, options, {
    participantId: message.participantId,
    messageId: message.id,
    artifactIds: message.relatedArtifactIds,
    sourceRefs: relatedArtifacts.map((artifact) => artifact.source),
  });
  const payload: MessageSentPayload = {
    messageId: message.id,
    kind: message.kind,
    participantId: message.participantId,
    bodyLength: message.body.length,
    relatedArtifactIds: message.relatedArtifactIds,
    relatedArtifactCount: message.relatedArtifactIds.length,
  };

  return createTelemetryEvent(
    missionControlTelemetryEventNames.messageSent,
    payload,
    provenance,
    options,
    [
      createMissionControlKpi(
        "messages.sent",
        1,
        options.occurredAt,
        options.source,
        provenance,
        { kind: message.kind },
      ),
      ...buildWorkshopKpiSnapshot(session, options.occurredAt, options.source),
    ],
  );
}

export function createRequirementApprovedTelemetry(
  session: WorkshopSession,
  requirement: WorkshopArtifact,
  options: EventOptions & {
    previousStatus?: WorkshopArtifact["status"];
  },
): MissionControlTelemetryEvent<
  typeof missionControlTelemetryEventNames.requirementApproved
> {
  return createRequirementLifecycleTelemetry(
    missionControlTelemetryEventNames.requirementApproved,
    "requirements.approved",
    "approved",
    "accepted",
    session,
    requirement,
    options,
  );
}

export function createRequirementBaselinedTelemetry(
  session: WorkshopSession,
  requirement: WorkshopArtifact,
  options: EventOptions & {
    previousStatus?: WorkshopArtifact["status"];
  },
): MissionControlTelemetryEvent<
  typeof missionControlTelemetryEventNames.requirementBaselined
> {
  return createRequirementLifecycleTelemetry(
    missionControlTelemetryEventNames.requirementBaselined,
    "requirements.baselined",
    "baselined",
    "accepted",
    session,
    requirement,
    options,
  );
}

export function createRequirementRejectedTelemetry(
  session: WorkshopSession,
  requirement: WorkshopArtifact,
  options: EventOptions & {
    previousStatus?: WorkshopArtifact["status"];
  },
): MissionControlTelemetryEvent<
  typeof missionControlTelemetryEventNames.requirementRejected
> {
  return createRequirementLifecycleTelemetry(
    missionControlTelemetryEventNames.requirementRejected,
    "requirements.rejected",
    "rejected",
    "rejected",
    session,
    requirement,
    options,
  );
}

export function createRequirementSupersededTelemetry(
  session: WorkshopSession,
  requirement: WorkshopArtifact,
  options: EventOptions & {
    previousStatus?: WorkshopArtifact["status"];
  },
): MissionControlTelemetryEvent<
  typeof missionControlTelemetryEventNames.requirementSuperseded
> {
  return createRequirementLifecycleTelemetry(
    missionControlTelemetryEventNames.requirementSuperseded,
    "requirements.superseded",
    "superseded",
    "parked",
    session,
    requirement,
    options,
  );
}

function createRequirementLifecycleTelemetry<
  TName extends
    | typeof missionControlTelemetryEventNames.requirementApproved
    | typeof missionControlTelemetryEventNames.requirementBaselined
    | typeof missionControlTelemetryEventNames.requirementRejected
    | typeof missionControlTelemetryEventNames.requirementSuperseded,
>(
  name: TName,
  kpiName: MissionControlKpiName,
  lifecycle: RequirementLifecyclePayload["lifecycle"],
  status: WorkshopArtifact["status"],
  session: WorkshopSession,
  requirement: WorkshopArtifact,
  options: EventOptions & {
    previousStatus?: WorkshopArtifact["status"];
  },
): MissionControlTelemetryEvent<TName> {
  if (requirement.type !== "requirement") {
    throw new Error(
      "Only requirement artifacts can emit requirement lifecycle telemetry.",
    );
  }

  const provenance = sessionProvenance(session, options, {
    participantId: requirement.createdBy,
    artifactId: requirement.id,
    artifactIds: [requirement.id],
    requirementId: requirement.id,
    requirementIds: [requirement.id],
    sourceMessageId: requirement.source.messageId,
    sourceArtifactId: requirement.source.artifactId,
    sourceRefs: [requirement.source],
  });
  const payload = {
    requirementId: requirement.id,
    title: requirement.title,
    previousStatus: options.previousStatus,
    status,
    lifecycle,
    sourceRef: requirement.source,
    tagCount: requirement.tags.length,
  } as MissionControlTelemetryPayloadByName[TName];

  return createTelemetryEvent(name, payload, provenance, options, [
    createMissionControlKpi(
      kpiName,
      1,
      options.occurredAt,
      options.source,
      provenance,
      { lifecycle },
    ),
    ...buildWorkshopKpiSnapshot(session, options.occurredAt, options.source),
  ]);
}

export function createConsolidationAppliedTelemetry(
  session: WorkshopSession,
  input: ConsolidationAppliedPayload,
  options: EventOptions,
): MissionControlTelemetryEvent<
  typeof missionControlTelemetryEventNames.consolidationApplied
> {
  const artifactIds = [...input.inputArtifactIds, ...input.outputArtifactIds];
  const sourceRefs = session.artifacts
    .filter((artifact) => artifactIds.includes(artifact.id))
    .map((artifact) => artifact.source);
  const provenance = sessionProvenance(session, options, {
    artifactIds,
    requirementIds: input.approvedRequirementIds,
    sourceRefs,
  });

  return createTelemetryEvent(
    missionControlTelemetryEventNames.consolidationApplied,
    input,
    provenance,
    options,
    [
      createMissionControlKpi(
        "consolidations.applied",
        1,
        options.occurredAt,
        options.source,
        provenance,
      ),
      ...buildWorkshopKpiSnapshot(session, options.occurredAt, options.source),
    ],
  );
}

export function createConsolidationParkedTelemetry(
  session: WorkshopSession,
  input: ConsolidationAppliedPayload,
  options: EventOptions,
): MissionControlTelemetryEvent<
  typeof missionControlTelemetryEventNames.consolidationParked
> {
  const artifactIds = [...input.inputArtifactIds, ...input.outputArtifactIds];
  const sourceRefs = session.artifacts
    .filter((artifact) => artifactIds.includes(artifact.id))
    .map((artifact) => artifact.source);
  const provenance = sessionProvenance(session, options, {
    artifactIds,
    requirementIds: input.approvedRequirementIds,
    sourceRefs,
  });

  return createTelemetryEvent(
    missionControlTelemetryEventNames.consolidationParked,
    input,
    provenance,
    options,
    [
      createMissionControlKpi(
        "consolidations.parked",
        1,
        options.occurredAt,
        options.source,
        provenance,
      ),
      ...buildWorkshopKpiSnapshot(session, options.occurredAt, options.source),
    ],
  );
}

export function createPrototypeGeneratedTelemetry(
  session: WorkshopSession,
  input: PrototypeGeneratedPayload,
  options: EventOptions,
): MissionControlTelemetryEvent<
  typeof missionControlTelemetryEventNames.prototypeGenerated
> {
  const provenance = sessionProvenance(session, options, {
    artifactIds: input.sourceArtifactIds,
    requirementIds: input.requirementIds,
    sourceRefs: session.artifacts
      .filter((artifact) => input.sourceArtifactIds.includes(artifact.id))
      .map((artifact) => artifact.source),
  });

  return createTelemetryEvent(
    missionControlTelemetryEventNames.prototypeGenerated,
    input,
    provenance,
    options,
    [
      createMissionControlKpi(
        "prototypes.generated",
        1,
        options.occurredAt,
        options.source,
        provenance,
        { format: input.format },
      ),
      ...buildWorkshopKpiSnapshot(session, options.occurredAt, options.source),
    ],
  );
}

export function createAuthBoundaryTelemetry(
  payload: AuthBoundaryPayload,
  options: EventOptions & {
    provenance?: MissionControlTelemetryProvenance;
  },
): MissionControlTelemetryEvent<
  typeof missionControlTelemetryEventNames.authBoundary
> {
  const provenance = mergeProvenance(options.provenance ?? {}, options);

  return createTelemetryEvent(
    missionControlTelemetryEventNames.authBoundary,
    payload,
    provenance,
    options,
    [
      createMissionControlKpi(
        "auth.boundary.events",
        1,
        options.occurredAt,
        options.source,
        provenance,
        { boundary: payload.boundary, event: payload.event },
      ),
    ],
  );
}

export function buildWorkshopKpiSnapshot(
  session: WorkshopSession,
  observedAt: string,
  source: MissionControlTelemetrySource,
): MissionControlKpiPayload[] {
  const provenance = sessionProvenance(session, {});
  const approvedRequirements = session.artifacts.filter(
    (artifact) =>
      artifact.type === "requirement" && artifact.status === "accepted",
  );
  const sourceArtifacts = session.artifacts.filter(
    (artifact) => artifact.type === "source",
  );
  const unresolvedArtifacts = session.artifacts.filter(
    (artifact) => artifact.status !== "accepted",
  );

  return [
    createMissionControlKpi(
      "workshop.messages.total",
      session.messages.length,
      observedAt,
      source,
      provenance,
    ),
    createMissionControlKpi(
      "workshop.artifacts.total",
      session.artifacts.length,
      observedAt,
      source,
      provenance,
    ),
    createMissionControlKpi(
      "workshop.attachments.total",
      session.attachments.length,
      observedAt,
      source,
      provenance,
    ),
    createMissionControlKpi(
      "workshop.sources.total",
      sourceArtifacts.length,
      observedAt,
      source,
      provenance,
    ),
    createMissionControlKpi(
      "workshop.requirements.approved.total",
      approvedRequirements.length,
      observedAt,
      source,
      provenance,
    ),
    createMissionControlKpi(
      "workshop.unresolved.total",
      unresolvedArtifacts.length,
      observedAt,
      source,
      provenance,
    ),
  ];
}

function createTelemetryEvent<TName extends MissionControlTelemetryEventName>(
  name: TName,
  payload: MissionControlTelemetryPayloadByName[TName],
  provenance: MissionControlTelemetryProvenance,
  options: EventOptions,
  kpis: MissionControlKpiPayload[],
): MissionControlTelemetryEvent<TName> {
  return {
    schemaVersion: missionControlTelemetrySchemaVersion,
    product: missionControlProductId,
    eventId: createEventId(name, options.occurredAt, provenance),
    name,
    occurredAt: options.occurredAt,
    source: options.source,
    provenance,
    payload,
    kpis,
  };
}

function createMissionControlKpi(
  name: MissionControlKpiName,
  value: number,
  observedAt: string,
  source: MissionControlTelemetrySource,
  provenance: MissionControlTelemetryProvenance,
  labels?: Record<string, string | number | boolean>,
): MissionControlKpiPayload {
  return {
    schemaVersion: missionControlTelemetrySchemaVersion,
    product: missionControlProductId,
    name,
    value,
    unit: "count",
    observedAt,
    source,
    provenance,
    labels,
  };
}

function sessionProvenance(
  session: WorkshopSession,
  options: Pick<
    EventOptions,
    "causationEventId" | "correlationId" | "recordId"
  >,
  extra: MissionControlTelemetryProvenance = {},
): MissionControlTelemetryProvenance {
  return mergeProvenance(
    {
      workshopId: session.id,
      workshopTitle: session.title,
      ...extra,
    },
    options,
  );
}

function mergeProvenance(
  provenance: MissionControlTelemetryProvenance,
  options: Pick<
    EventOptions,
    "causationEventId" | "correlationId" | "recordId"
  >,
): MissionControlTelemetryProvenance {
  return {
    ...provenance,
    recordId: options.recordId ?? provenance.recordId,
    causationEventId: options.causationEventId ?? provenance.causationEventId,
    correlationId: options.correlationId ?? provenance.correlationId,
  };
}

function createEventId(
  name: MissionControlTelemetryEventName,
  occurredAt: string,
  provenance: MissionControlTelemetryProvenance,
) {
  const seed = [
    name,
    occurredAt,
    provenance.workshopId,
    provenance.messageId,
    provenance.artifactId,
    provenance.requirementId,
    provenance.recordId,
  ]
    .filter(Boolean)
    .join(":");

  return `mc-${slugify(seed)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
}
