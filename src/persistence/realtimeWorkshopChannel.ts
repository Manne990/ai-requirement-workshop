import {
  applyPresenceEvent,
  compareCollaborationEvents,
  createPresenceEvent,
  createPresenceState,
  listPresenceSessions,
  type WorkshopCollaborationEvent,
  type WorkshopPresenceSession,
  type WorkshopPresenceState,
} from "../domain/collaboration";

export type RealtimeUnsubscribe = () => void;

export type RealtimeWorkshopChannel = {
  workshopId: string;
  clientSessionId: string;
  subscribeToEvents: (
    listener: (event: WorkshopCollaborationEvent) => void,
  ) => RealtimeUnsubscribe;
  publishEvent: (event: WorkshopCollaborationEvent) => Promise<void>;
  subscribeToPresence: (
    listener: (sessions: WorkshopPresenceSession[]) => void,
  ) => RealtimeUnsubscribe;
  trackPresence: (session: WorkshopPresenceSession) => Promise<void>;
  untrackPresence: (sessionId?: string) => Promise<void>;
  getPresenceSnapshot: () => WorkshopPresenceSession[];
  close: () => Promise<void>;
};

export type LocalRealtimeWorkshopHub = {
  workshopId: string;
  presenceState: WorkshopPresenceState;
  eventLog: WorkshopCollaborationEvent[];
  channels: Set<LocalRealtimeWorkshopChannel>;
};

export type LocalRealtimeWorkshopChannelOptions = {
  workshopId: string;
  clientId: string;
  clientSessionId: string;
  hub?: LocalRealtimeWorkshopHub;
};

type LocalRealtimeWorkshopChannel = RealtimeWorkshopChannel & {
  eventListeners: Set<(event: WorkshopCollaborationEvent) => void>;
  deliveredEventIdsByListener: Map<
    (event: WorkshopCollaborationEvent) => void,
    Set<string>
  >;
  presenceListeners: Set<(sessions: WorkshopPresenceSession[]) => void>;
};

export function createLocalRealtimeWorkshopHub(
  workshopId: string,
): LocalRealtimeWorkshopHub {
  return {
    workshopId,
    presenceState: createPresenceState(workshopId),
    eventLog: [],
    channels: new Set(),
  };
}

export function createLocalRealtimeWorkshopChannel({
  workshopId,
  clientId,
  clientSessionId,
  hub = createLocalRealtimeWorkshopHub(workshopId),
}: LocalRealtimeWorkshopChannelOptions): RealtimeWorkshopChannel {
  if (hub.workshopId !== workshopId) {
    throw new Error("Local realtime hub workshop does not match channel.");
  }

  let presenceSequence = 0;
  const channel: LocalRealtimeWorkshopChannel = {
    workshopId,
    clientSessionId,
    eventListeners: new Set(),
    deliveredEventIdsByListener: new Map(),
    presenceListeners: new Set(),

    subscribeToEvents(listener) {
      channel.eventListeners.add(listener);
      channel.deliveredEventIdsByListener.set(listener, new Set());
      deliverUndeliveredEvents(channel, hub, listener);
      return () => {
        channel.eventListeners.delete(listener);
        channel.deliveredEventIdsByListener.delete(listener);
      };
    },

    async publishEvent(event) {
      hub.eventLog = [...hub.eventLog, cloneJson(event)].sort(
        compareCollaborationEvents,
      );
      for (const candidate of hub.channels) {
        for (const listener of candidate.eventListeners) {
          deliverUndeliveredEvents(candidate, hub, listener);
        }
      }
    },

    subscribeToPresence(listener) {
      channel.presenceListeners.add(listener);
      listener(channel.getPresenceSnapshot());
      return () => channel.presenceListeners.delete(listener);
    },

    async trackPresence(session) {
      presenceSequence += 1;
      const existing = hub.presenceState.sessionsById[session.sessionId];
      hub.presenceState = applyPresenceEvent(
        hub.presenceState,
        createPresenceEvent({
          type: existing ? "presence.heartbeat" : "presence.joined",
          workshopId,
          clientId,
          clientSessionId,
          sequence: presenceSequence,
          occurredAt: session.lastSeenAt,
          payload: { session: cloneJson(session) },
        }),
      );
      broadcastPresence(hub);
    },

    async untrackPresence(sessionId = clientSessionId) {
      presenceSequence += 1;
      const existing = hub.presenceState.sessionsById[sessionId];
      const leftAt = existing?.lastSeenAt ?? new Date(0).toISOString();
      hub.presenceState = applyPresenceEvent(
        hub.presenceState,
        createPresenceEvent({
          type: "presence.left",
          workshopId,
          clientId,
          clientSessionId,
          sequence: presenceSequence,
          occurredAt: leftAt,
          payload: { sessionId, leftAt },
        }),
      );
      broadcastPresence(hub);
    },

    getPresenceSnapshot() {
      return listPresenceSessions(hub.presenceState).map(cloneJson);
    },

    async close() {
      await channel.untrackPresence(clientSessionId);
      hub.channels.delete(channel);
      channel.eventListeners.clear();
      channel.deliveredEventIdsByListener.clear();
      channel.presenceListeners.clear();
    },
  };

  hub.channels.add(channel);
  return channel;
}

export type SupabaseRealtimeClient = {
  channel: (
    topic: string,
    options?: Record<string, unknown>,
  ) => SupabaseRealtimeChannel;
  removeChannel?: (
    channel: SupabaseRealtimeChannel,
  ) => Promise<unknown> | unknown;
};

export type SupabaseRealtimeChannel = {
  on: (
    type: string,
    filter: Record<string, unknown>,
    callback: (payload: unknown) => void,
  ) => SupabaseRealtimeChannel;
  subscribe: (
    callback?: (status: string, error?: unknown) => void,
  ) => SupabaseRealtimeChannel;
  send: (payload: Record<string, unknown>) => Promise<unknown> | unknown;
  track: (payload: Record<string, unknown>) => Promise<unknown> | unknown;
  untrack: () => Promise<unknown> | unknown;
  presenceState: () => Record<string, unknown[]>;
  unsubscribe?: () => Promise<unknown> | unknown;
};

export type SupabaseRealtimeWorkshopChannelOptions = {
  supabase: SupabaseRealtimeClient;
  workshopId: string;
  clientSessionId: string;
};

export function createSupabaseRealtimeWorkshopChannel({
  supabase,
  workshopId,
  clientSessionId,
}: SupabaseRealtimeWorkshopChannelOptions): RealtimeWorkshopChannel {
  const eventListeners = new Set<(event: WorkshopCollaborationEvent) => void>();
  const presenceListeners = new Set<
    (sessions: WorkshopPresenceSession[]) => void
  >();
  const supabaseChannel = supabase.channel(`workshop:${workshopId}`, {
    config: {
      broadcast: { self: true },
      presence: { key: clientSessionId },
    },
  });

  const emitPresence = () => {
    const sessions = readSupabasePresence(supabaseChannel.presenceState());
    for (const listener of presenceListeners) {
      listener(sessions.map(cloneJson));
    }
  };

  supabaseChannel
    .on("broadcast", { event: "workshop_event" }, (payload) => {
      const event = readSupabaseBroadcastEvent(payload);
      if (!event || event.workshopId !== workshopId) {
        return;
      }
      for (const listener of eventListeners) {
        listener(cloneJson(event));
      }
    })
    .on("presence", { event: "sync" }, emitPresence)
    .on("presence", { event: "join" }, emitPresence)
    .on("presence", { event: "leave" }, emitPresence)
    .subscribe();

  return {
    workshopId,
    clientSessionId,

    subscribeToEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },

    async publishEvent(event) {
      await supabaseChannel.send({
        type: "broadcast",
        event: "workshop_event",
        payload: { event },
      });
    },

    subscribeToPresence(listener) {
      presenceListeners.add(listener);
      listener(readSupabasePresence(supabaseChannel.presenceState()));
      return () => presenceListeners.delete(listener);
    },

    async trackPresence(session) {
      await supabaseChannel.track(cloneJson(session));
    },

    async untrackPresence() {
      await supabaseChannel.untrack();
    },

    getPresenceSnapshot() {
      return readSupabasePresence(supabaseChannel.presenceState());
    },

    async close() {
      eventListeners.clear();
      presenceListeners.clear();
      if (supabase.removeChannel) {
        await supabase.removeChannel(supabaseChannel);
        return;
      }
      await supabaseChannel.unsubscribe?.();
    },
  };
}

function broadcastPresence(hub: LocalRealtimeWorkshopHub) {
  const sessions = listPresenceSessions(hub.presenceState);
  for (const channel of hub.channels) {
    for (const listener of channel.presenceListeners) {
      listener(sessions.map(cloneJson));
    }
  }
}

function deliverUndeliveredEvents(
  channel: LocalRealtimeWorkshopChannel,
  hub: LocalRealtimeWorkshopHub,
  listener: (event: WorkshopCollaborationEvent) => void,
) {
  const delivered = channel.deliveredEventIdsByListener.get(listener);
  if (!delivered) {
    return;
  }

  for (const event of hub.eventLog) {
    if (delivered.has(event.id)) {
      continue;
    }
    delivered.add(event.id);
    listener(cloneJson(event));
  }
}

function readSupabaseBroadcastEvent(
  payload: unknown,
): WorkshopCollaborationEvent | null {
  if (!isRecord(payload)) {
    return null;
  }
  const event = isRecord(payload.payload) ? payload.payload.event : null;
  return isCollaborationEvent(event) ? event : null;
}

function readSupabasePresence(
  state: Record<string, unknown[]>,
): WorkshopPresenceSession[] {
  return Object.values(state)
    .flat()
    .filter(isPresenceSession)
    .sort(comparePresenceSessions)
    .map(cloneJson);
}

function isCollaborationEvent(
  value: unknown,
): value is WorkshopCollaborationEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workshopId === "string" &&
    typeof value.clientId === "string" &&
    typeof value.clientSessionId === "string" &&
    typeof value.sequence === "number" &&
    typeof value.occurredAt === "string" &&
    isRecord(value.actor) &&
    typeof value.type === "string" &&
    isRecord(value.payload)
  );
}

function isPresenceSession(value: unknown): value is WorkshopPresenceSession {
  return (
    isRecord(value) &&
    typeof value.workshopId === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.clientId === "string" &&
    typeof value.participantId === "string" &&
    typeof value.displayName === "string" &&
    typeof value.status === "string" &&
    typeof value.connectedAt === "string" &&
    typeof value.lastSeenAt === "string"
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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
