import { describe, expect, it } from "vitest";
import {
  createCollaborationEvent,
  type CollaborationActor,
  type WorkshopCollaborationEvent,
} from "../domain/collaboration";
import {
  createBrowserRealtimeWorkshopChannel,
  type BrowserBroadcastChannel,
} from "./browserRealtimeWorkshopChannel";

const workshopId = "browser-realtime-workshop";
const actor: CollaborationActor = {
  participantId: "human-1",
  userId: "user-1",
  displayName: "Ada",
  type: "human",
};

describe("browserRealtimeWorkshopChannel", () => {
  it("replays stored events independently for each listener", async () => {
    const storage = createMemoryStorage();
    const firstBroadcast = createMemoryBroadcastChannel();
    const secondBroadcast = createMemoryBroadcastChannel();
    firstBroadcast.connect(secondBroadcast);
    const first = createBrowserRealtimeWorkshopChannel({
      workshopId,
      clientId: "client-a",
      clientSessionId: "session-a",
      storage,
      broadcastChannel: firstBroadcast,
    });
    const second = createBrowserRealtimeWorkshopChannel({
      workshopId,
      clientId: "client-b",
      clientSessionId: "session-b",
      storage,
      broadcastChannel: secondBroadcast,
    });
    const event = messageEvent("message-1", "2026-07-06T22:00:00.000Z");
    const firstReceived: WorkshopCollaborationEvent[] = [];
    const secondReceived: WorkshopCollaborationEvent[] = [];

    await first.publishEvent(event);
    first.subscribeToEvents((incoming) => firstReceived.push(incoming));
    second.subscribeToEvents((incoming) => secondReceived.push(incoming));

    expect(firstReceived.map((incoming) => incoming.id)).toEqual([event.id]);
    expect(secondReceived.map((incoming) => incoming.id)).toEqual([event.id]);

    await first.close();
    await second.close();
  });

  it("broadcasts presence and ignores other workshop events", async () => {
    const storage = createMemoryStorage();
    const firstBroadcast = createMemoryBroadcastChannel();
    const secondBroadcast = createMemoryBroadcastChannel();
    firstBroadcast.connect(secondBroadcast);
    const first = createBrowserRealtimeWorkshopChannel({
      workshopId,
      clientId: "client-a",
      clientSessionId: "session-a",
      storage,
      broadcastChannel: firstBroadcast,
    });
    const second = createBrowserRealtimeWorkshopChannel({
      workshopId,
      clientId: "client-b",
      clientSessionId: "session-b",
      storage,
      broadcastChannel: secondBroadcast,
    });
    const secondPresenceSnapshots: string[][] = [];
    const secondEvents: WorkshopCollaborationEvent[] = [];

    second.subscribeToPresence((sessions) =>
      secondPresenceSnapshots.push(
        sessions.map((session) => session.displayName),
      ),
    );
    second.subscribeToEvents((event) => secondEvents.push(event));
    await first.trackPresence({
      workshopId,
      sessionId: "session-a",
      clientId: "client-a",
      participantId: "human-1",
      userId: "user-1",
      displayName: "Ada",
      status: "active",
      connectedAt: "2026-07-06T22:01:00.000Z",
      lastSeenAt: "2026-07-06T22:01:00.000Z",
    });
    await first.publishEvent({
      ...messageEvent("message-other", "2026-07-06T22:01:01.000Z"),
      workshopId: "other-workshop",
    });

    expect(secondPresenceSnapshots).toEqual([[], ["Ada"]]);
    expect(secondEvents).toEqual([]);

    await first.close();
    await second.close();
  });
});

function messageEvent(messageId: string, occurredAt: string) {
  return createCollaborationEvent({
    type: "message.added",
    workshopId,
    clientId: "client-a",
    clientSessionId: "session-a",
    sequence: 1,
    occurredAt,
    actor,
    payload: {
      message: {
        id: messageId,
        participantId: "human-1",
        kind: "human-input",
        body: "Realtime browser message.",
        relatedArtifactIds: [],
        createdAt: occurredAt,
      },
    },
  });
}

function createMemoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

type MemoryBroadcastChannel = BrowserBroadcastChannel & {
  connect: (peer: MemoryBroadcastChannel) => void;
  emit: (message: unknown) => void;
  peers: Set<MemoryBroadcastChannel>;
};

function createMemoryBroadcastChannel(): MemoryBroadcastChannel {
  const listeners = new Set<(event: MessageEvent<unknown>) => void>();
  const peers = new Set<MemoryBroadcastChannel>();
  const channel = {
    postMessage(message: unknown) {
      for (const peer of peers) {
        peer.emit(message);
      }
    },
    close() {
      listeners.clear();
      peers.clear();
    },
    addEventListener(
      _type: "message",
      listener: (event: MessageEvent<unknown>) => void,
    ) {
      listeners.add(listener);
    },
    removeEventListener(
      _type: "message",
      listener: (event: MessageEvent<unknown>) => void,
    ) {
      listeners.delete(listener);
    },
    connect(peer: MemoryBroadcastChannel) {
      peers.add(peer);
      peer.peers.add(channel);
    },
    emit(message: unknown) {
      for (const listener of listeners) {
        listener({ data: message } as MessageEvent<unknown>);
      }
    },
    peers,
  } satisfies MemoryBroadcastChannel;
  return channel;
}
