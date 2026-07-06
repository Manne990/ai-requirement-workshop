import { describe, expect, it, vi } from "vitest";
import {
  createCollaborationEvent,
  type CollaborationActor,
  type WorkshopCollaborationEvent,
  type WorkshopPresenceSession,
} from "../domain/collaboration";
import {
  createLocalRealtimeWorkshopChannel,
  createLocalRealtimeWorkshopHub,
  createSupabaseRealtimeWorkshopChannel,
  type SupabaseRealtimeChannel,
} from "./realtimeWorkshopChannel";

const workshopId = "workshop-realtime";
const actor: CollaborationActor = {
  participantId: "human-1",
  userId: "user-1",
  displayName: "Ada",
  type: "human",
};

describe("realtimeWorkshopChannel", () => {
  it("fans events and presence through the local fallback hub", async () => {
    const hub = createLocalRealtimeWorkshopHub(workshopId);
    const first = createLocalRealtimeWorkshopChannel({
      workshopId,
      clientId: "client-a",
      clientSessionId: "session-a",
      hub,
    });
    const second = createLocalRealtimeWorkshopChannel({
      workshopId,
      clientId: "client-b",
      clientSessionId: "session-b",
      hub,
    });
    const received: WorkshopCollaborationEvent[] = [];
    const presenceSnapshots: string[][] = [];

    second.subscribeToEvents((event) => received.push(event));
    second.subscribeToPresence((sessions) =>
      presenceSnapshots.push(sessions.map((session) => session.displayName)),
    );

    const event = eventFor("message-1", "2026-07-06T10:00:00.000Z");
    await first.publishEvent(event);
    await first.trackPresence(
      presence("session-a", "Ada", "2026-07-06T10:00:01.000Z"),
    );
    await second.trackPresence(
      presence("session-b", "Grace", "2026-07-06T10:00:02.000Z"),
    );
    await first.close();

    expect(received).toEqual([event]);
    expect(hub.eventLog).toEqual([event]);
    expect(presenceSnapshots).toEqual([
      [],
      ["Ada"],
      ["Ada", "Grace"],
      ["Grace"],
    ]);
    expect(
      second.getPresenceSnapshot().map((session) => session.displayName),
    ).toEqual(["Grace"]);

    await second.close();
  });

  it("proves two local sessions get deterministic presence and event catch-up", async () => {
    const hub = createLocalRealtimeWorkshopHub(workshopId);
    const first = createLocalRealtimeWorkshopChannel({
      workshopId,
      clientId: "client-a",
      clientSessionId: "session-a",
      hub,
    });
    const second = createLocalRealtimeWorkshopChannel({
      workshopId,
      clientId: "client-b",
      clientSessionId: "session-b",
      hub,
    });
    const firstPresenceSnapshots: string[][] = [];
    const secondPresenceSnapshots: string[][] = [];

    first.subscribeToPresence((sessions) =>
      firstPresenceSnapshots.push(sessions.map((session) => session.sessionId)),
    );
    second.subscribeToPresence((sessions) =>
      secondPresenceSnapshots.push(
        sessions.map((session) => session.sessionId),
      ),
    );

    await first.trackPresence(
      presence("session-a", "Ada", "2026-07-06T10:02:01.000Z"),
    );
    await second.trackPresence(
      presence("session-b", "Grace", "2026-07-06T10:02:02.000Z"),
    );
    await first.untrackPresence();

    expect(firstPresenceSnapshots).toEqual([
      [],
      ["session-a"],
      ["session-a", "session-b"],
      ["session-b"],
    ]);
    expect(secondPresenceSnapshots).toEqual(firstPresenceSnapshots);
    expect(
      first.getPresenceSnapshot().map((session) => session.sessionId),
    ).toEqual(["session-b"]);

    const later = eventFor("message-later", "2026-07-06T10:03:02.000Z", {
      clientId: "client-b",
      clientSessionId: "session-b",
      sequence: 1,
    });
    const earlier = eventFor("message-earlier", "2026-07-06T10:03:01.000Z", {
      clientId: "client-a",
      clientSessionId: "session-a",
      sequence: 1,
    });

    await second.publishEvent(later);
    await first.publishEvent(earlier);

    const replayed: WorkshopCollaborationEvent[] = [];
    second.subscribeToEvents((event) => replayed.push(event));

    expect(messageIds(hub.eventLog)).toEqual([
      "message-earlier",
      "message-later",
    ]);
    expect(messageIds(replayed)).toEqual(["message-earlier", "message-later"]);

    await first.close();
    await second.close();
  });

  it("wraps Supabase Realtime broadcast and presence without secrets", async () => {
    const fakeChannel = createFakeSupabaseChannel();
    const supabase = {
      channel: vi.fn(() => fakeChannel),
      removeChannel: vi.fn(async () => undefined),
    };
    const realtime = createSupabaseRealtimeWorkshopChannel({
      supabase,
      workshopId,
      clientSessionId: "session-a",
    });
    const received: WorkshopCollaborationEvent[] = [];
    const presenceSnapshots: WorkshopPresenceSession[][] = [];
    const event = eventFor("message-2", "2026-07-06T10:01:00.000Z");
    const ada = presence("session-a", "Ada", "2026-07-06T10:01:01.000Z");

    realtime.subscribeToEvents((incoming) => received.push(incoming));
    realtime.subscribeToPresence((sessions) =>
      presenceSnapshots.push(sessions),
    );
    fakeChannel.setPresence({ "session-a": [ada] });
    fakeChannel.emit("presence", "sync", {});
    fakeChannel.emit("broadcast", "workshop_event", {
      payload: { event },
    });
    await realtime.publishEvent(event);
    await realtime.trackPresence(ada);
    await realtime.untrackPresence();
    await realtime.close();

    expect(supabase.channel).toHaveBeenCalledWith(
      "workshop:workshop-realtime",
      {
        config: {
          broadcast: { self: true },
          presence: { key: "session-a" },
        },
      },
    );
    expect(received).toEqual([event]);
    expect(presenceSnapshots.at(-1)).toEqual([ada]);
    expect(fakeChannel.sent).toEqual([
      {
        type: "broadcast",
        event: "workshop_event",
        payload: { event },
      },
    ]);
    expect(fakeChannel.tracked).toEqual([ada]);
    expect(fakeChannel.untrackedCount).toBe(1);
    expect(supabase.removeChannel).toHaveBeenCalledWith(fakeChannel);
  });
});

type FakeSupabaseChannel = SupabaseRealtimeChannel & {
  sent: Record<string, unknown>[];
  tracked: Record<string, unknown>[];
  untrackedCount: number;
  emit: (type: string, event: string, payload: unknown) => void;
  setPresence: (nextPresence: Record<string, unknown[]>) => void;
};

function createFakeSupabaseChannel(): FakeSupabaseChannel {
  const handlers: {
    type: string;
    event: string;
    callback: (payload: unknown) => void;
  }[] = [];
  let presence: Record<string, unknown[]> = {};

  return {
    sent: [],
    tracked: [],
    untrackedCount: 0,

    on(type, filter, callback) {
      handlers.push({
        type,
        event: String(filter.event),
        callback,
      });
      return this;
    },

    subscribe() {
      return this;
    },

    async send(payload) {
      this.sent.push(payload);
    },

    async track(payload) {
      this.tracked.push(payload);
    },

    async untrack() {
      this.untrackedCount += 1;
    },

    presenceState() {
      return presence;
    },

    emit(type, event, payload) {
      for (const handler of handlers) {
        if (handler.type === type && handler.event === event) {
          handler.callback(payload);
        }
      }
    },

    setPresence(nextPresence) {
      presence = nextPresence;
    },
  };
}

function eventFor(
  id: string,
  occurredAt: string,
  options: {
    clientId?: string;
    clientSessionId?: string;
    sequence?: number;
  } = {},
): WorkshopCollaborationEvent {
  return createCollaborationEvent({
    type: "message.added",
    workshopId,
    clientId: options.clientId ?? "client-a",
    clientSessionId: options.clientSessionId ?? "session-a",
    sequence: options.sequence ?? 1,
    occurredAt,
    actor,
    payload: {
      message: {
        id,
        participantId: "human-1",
        kind: "human-input",
        body: "Realtime collaboration update.",
        createdAt: occurredAt,
        relatedArtifactIds: [],
      },
    },
  });
}

function messageIds(events: WorkshopCollaborationEvent[]): string[] {
  return events.map((event) =>
    event.type === "message.added" ? event.payload.message.id : event.id,
  );
}

function presence(
  sessionId: string,
  displayName: string,
  at: string,
): WorkshopPresenceSession {
  return {
    workshopId,
    sessionId,
    clientId: sessionId.replace("session", "client"),
    participantId: "human-1",
    userId: sessionId.replace("session", "user"),
    displayName,
    status: "active",
    connectedAt: at,
    lastSeenAt: at,
  };
}
