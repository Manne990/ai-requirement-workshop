import {
  applyPresenceEvent,
  compareCollaborationEvents,
  createPresenceEvent,
  createPresenceState,
  listPresenceSessions,
  type WorkshopCollaborationEvent,
  type WorkshopPresenceEvent,
  type WorkshopPresenceSession,
  type WorkshopPresenceState,
} from "../domain/collaboration";
import type {
  RealtimeUnsubscribe,
  RealtimeWorkshopChannel,
} from "./realtimeWorkshopChannel";

export type BrowserRealtimeWorkshopChannelOptions = {
  workshopId: string;
  clientId: string;
  clientSessionId: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
  broadcastChannel?: BrowserBroadcastChannel;
};

export type BrowserBroadcastChannel = {
  postMessage: (message: unknown) => void;
  close: () => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
  removeEventListener: (
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
};

type BrowserRealtimeMessage =
  | { kind: "event"; event: WorkshopCollaborationEvent }
  | { kind: "presence"; event: WorkshopPresenceEvent };

const maxStoredEvents = 250;

export function createBrowserRealtimeWorkshopChannel({
  workshopId,
  clientId,
  clientSessionId,
  storage,
  broadcastChannel,
}: BrowserRealtimeWorkshopChannelOptions): RealtimeWorkshopChannel {
  const storageAdapter = storage ?? requireBrowserStorage();
  const broadcastAdapter =
    broadcastChannel ?? createBrowserBroadcastChannel(workshopId);
  const eventListeners = new Set<(event: WorkshopCollaborationEvent) => void>();
  const deliveredEventIdsByListener = new Map<
    (event: WorkshopCollaborationEvent) => void,
    Set<string>
  >();
  const presenceListeners = new Set<
    (sessions: WorkshopPresenceSession[]) => void
  >();
  let presenceSequence = 0;
  let closed = false;

  const emitEvents = (
    listener?: (event: WorkshopCollaborationEvent) => void,
  ) => {
    const listeners = listener ? [listener] : [...eventListeners];
    for (const event of readEventLog(storageAdapter, workshopId)) {
      for (const listener of listeners) {
        const delivered = deliveredEventIdsByListener.get(listener);
        if (!delivered || delivered.has(event.id)) {
          continue;
        }
        delivered.add(event.id);
        listener(cloneJson(event));
      }
    }
  };

  const emitPresence = () => {
    const sessions = listPresenceSessions(
      readPresenceState(storageAdapter, workshopId),
    );
    for (const listener of presenceListeners) {
      listener(sessions.map(cloneJson));
    }
  };

  const onMessage = (event: MessageEvent<unknown>) => {
    const message = readRealtimeMessage(event.data);
    if (!message) {
      return;
    }

    if (message.kind === "event") {
      if (message.event.workshopId !== workshopId) {
        return;
      }
      appendEvent(storageAdapter, workshopId, message.event);
      emitEvents();
      return;
    }

    if (message.event.workshopId !== workshopId) {
      return;
    }
    appendPresenceEvent(storageAdapter, workshopId, message.event);
    emitPresence();
  };

  broadcastAdapter.addEventListener("message", onMessage);

  return {
    workshopId,
    clientSessionId,

    subscribeToEvents(listener): RealtimeUnsubscribe {
      eventListeners.add(listener);
      deliveredEventIdsByListener.set(listener, new Set());
      emitEvents(listener);
      return () => {
        eventListeners.delete(listener);
        deliveredEventIdsByListener.delete(listener);
      };
    },

    async publishEvent(event) {
      if (closed) {
        return;
      }
      appendEvent(storageAdapter, workshopId, event);
      emitEvents();
      broadcastAdapter.postMessage({ kind: "event", event });
    },

    subscribeToPresence(listener): RealtimeUnsubscribe {
      presenceListeners.add(listener);
      listener(
        listPresenceSessions(readPresenceState(storageAdapter, workshopId)),
      );
      return () => presenceListeners.delete(listener);
    },

    async trackPresence(session) {
      if (closed) {
        return;
      }
      presenceSequence += 1;
      const existing = readPresenceState(storageAdapter, workshopId)
        .sessionsById[session.sessionId];
      const presenceEvent = createPresenceEvent({
        type: existing ? "presence.heartbeat" : "presence.joined",
        workshopId,
        clientId,
        clientSessionId,
        sequence: presenceSequence,
        occurredAt: session.lastSeenAt,
        payload: { session: cloneJson(session) },
      });
      appendPresenceEvent(storageAdapter, workshopId, presenceEvent);
      emitPresence();
      broadcastAdapter.postMessage({ kind: "presence", event: presenceEvent });
    },

    async untrackPresence(sessionId = clientSessionId) {
      if (closed) {
        return;
      }
      presenceSequence += 1;
      const existing = readPresenceState(storageAdapter, workshopId)
        .sessionsById[sessionId];
      const leftAt = existing?.lastSeenAt ?? new Date().toISOString();
      const presenceEvent = createPresenceEvent({
        type: "presence.left",
        workshopId,
        clientId,
        clientSessionId,
        sequence: presenceSequence,
        occurredAt: leftAt,
        payload: { sessionId, leftAt },
      });
      appendPresenceEvent(storageAdapter, workshopId, presenceEvent);
      emitPresence();
      broadcastAdapter.postMessage({ kind: "presence", event: presenceEvent });
    },

    getPresenceSnapshot() {
      return listPresenceSessions(
        readPresenceState(storageAdapter, workshopId),
      );
    },

    async close() {
      await this.untrackPresence(clientSessionId);
      closed = true;
      broadcastAdapter.removeEventListener("message", onMessage);
      broadcastAdapter.close();
      eventListeners.clear();
      deliveredEventIdsByListener.clear();
      presenceListeners.clear();
    },
  };
}

function appendEvent(
  storage: Pick<Storage, "getItem" | "setItem">,
  workshopId: string,
  event: WorkshopCollaborationEvent,
) {
  const events = readEventLog(storage, workshopId);
  if (events.some((candidate) => candidate.id === event.id)) {
    return;
  }
  if (event.workshopId !== workshopId) {
    return;
  }
  storage.setItem(
    eventLogKey(workshopId),
    JSON.stringify(
      [...events, cloneJson(event)]
        .sort(compareCollaborationEvents)
        .slice(-maxStoredEvents),
    ),
  );
}

function appendPresenceEvent(
  storage: Pick<Storage, "getItem" | "setItem">,
  workshopId: string,
  event: WorkshopPresenceEvent,
) {
  if (event.workshopId !== workshopId) {
    return;
  }
  const nextState = applyPresenceEvent(
    readPresenceState(storage, workshopId),
    event,
  );
  storage.setItem(presenceKey(workshopId), JSON.stringify(nextState));
}

function readEventLog(
  storage: Pick<Storage, "getItem">,
  workshopId: string,
): WorkshopCollaborationEvent[] {
  try {
    const parsed = JSON.parse(storage.getItem(eventLogKey(workshopId)) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(isCollaborationEvent).sort(compareCollaborationEvents)
      : [];
  } catch {
    return [];
  }
}

function readPresenceState(
  storage: Pick<Storage, "getItem">,
  workshopId: string,
): WorkshopPresenceState {
  try {
    const parsed = JSON.parse(storage.getItem(presenceKey(workshopId)) ?? "{}");
    return isPresenceState(parsed) && parsed.workshopId === workshopId
      ? parsed
      : createPresenceState(workshopId);
  } catch {
    return createPresenceState(workshopId);
  }
}

function readRealtimeMessage(value: unknown): BrowserRealtimeMessage | null {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return null;
  }

  if (value.kind === "event" && isCollaborationEvent(value.event)) {
    return { kind: "event", event: value.event };
  }

  if (value.kind === "presence" && isPresenceEvent(value.event)) {
    return { kind: "presence", event: value.event };
  }

  return null;
}

function channelName(workshopId: string) {
  return `ai-requirement-workshop:${workshopId}`;
}

function eventLogKey(workshopId: string) {
  return `${channelName(workshopId)}:events`;
}

function presenceKey(workshopId: string) {
  return `${channelName(workshopId)}:presence`;
}

function requireBrowserStorage(): Pick<Storage, "getItem" | "setItem"> {
  if (typeof window === "undefined") {
    throw new Error("Browser realtime storage requires window.localStorage.");
  }

  return window.localStorage;
}

function createBrowserBroadcastChannel(
  workshopId: string,
): BrowserBroadcastChannel {
  if (typeof BroadcastChannel === "undefined") {
    throw new Error("Browser realtime requires BroadcastChannel.");
  }

  return new BroadcastChannel(channelName(workshopId));
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
    typeof value.type === "string" &&
    isRecord(value.actor) &&
    isRecord(value.payload)
  );
}

function isPresenceEvent(value: unknown): value is WorkshopPresenceEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workshopId === "string" &&
    typeof value.clientId === "string" &&
    typeof value.clientSessionId === "string" &&
    typeof value.sequence === "number" &&
    typeof value.occurredAt === "string" &&
    typeof value.type === "string" &&
    isRecord(value.payload)
  );
}

function isPresenceState(value: unknown): value is WorkshopPresenceState {
  return (
    isRecord(value) &&
    typeof value.workshopId === "string" &&
    isRecord(value.sessionsById) &&
    Array.isArray(value.appliedEventIds)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
