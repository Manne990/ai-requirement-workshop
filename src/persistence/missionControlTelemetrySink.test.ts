import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAuthBoundaryTelemetry,
  createWorkshopOpenedTelemetry,
  missionControlProductId,
  type MissionControlTelemetrySource,
} from "../domain/missionControlTelemetry";
import { createInitialWorkshopSession } from "../domain/workshop";
import {
  createMissionControlTelemetrySink,
  missionControlTelemetryStorageKey,
  readMissionControlTelemetryRecords,
  redactMissionControlTelemetryEvent,
} from "./missionControlTelemetrySink";

const source: MissionControlTelemetrySource = {
  product: missionControlProductId,
  surface: "workshop-room",
  trigger: "user",
  runtime: "test",
  component: "mission-control-telemetry-sink.test",
};

describe("missionControlTelemetrySink", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("stores a redacted telemetry event locally", async () => {
    const event = createWorkshopOpenedTelemetry(
      {
        ...createInitialWorkshopSession(
          "2026-07-06T08:00:00.000Z",
          "workshop-sensitive",
        ),
        title: "Private procurement modernization",
      },
      {
        occurredAt: "2026-07-06T08:01:00.000Z",
        source,
      },
    );
    const sink = createMissionControlTelemetrySink({
      now: () => "2026-07-06T08:01:01.000Z",
    });

    const result = await sink.record(event);

    expect(result).toMatchObject({
      recordedAt: "2026-07-06T08:01:01.000Z",
      local: "stored",
      remote: "skipped",
    });
    expect(readMissionControlTelemetryRecords()).toEqual([
      expect.objectContaining({
        recordedAt: "2026-07-06T08:01:01.000Z",
        event: expect.objectContaining({
          eventId: event.eventId,
          payload: expect.objectContaining({ title: "[redacted]" }),
          provenance: expect.objectContaining({
            workshopTitle: "[redacted]",
          }),
        }),
      }),
    ]);
    expect(
      window.localStorage.getItem(missionControlTelemetryStorageKey),
    ).not.toContain("Private procurement modernization");
  });

  it("posts the redacted event to a configured endpoint", async () => {
    const fetcher = vi.fn(async (_input: string, _init: RequestInit) => ({
      ok: true,
      status: 202,
    }));
    const event = createAuthBoundaryTelemetry(
      {
        boundary: "remote-api",
        event: "failed",
        provider: "openai",
        reason: "Bearer token abc123 was rejected",
      },
      {
        occurredAt: "2026-07-06T08:02:00.000Z",
        source: { ...source, surface: "auth-boundary", trigger: "system" },
      },
    );
    const sink = createMissionControlTelemetrySink({
      endpoint: " /api/mission-control/telemetry ",
      fetcher,
      now: () => "2026-07-06T08:02:01.000Z",
    });

    const result = await sink.record(event);

    expect(result).toMatchObject({
      local: "stored",
      remote: "sent",
      remoteStatus: 202,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/mission-control/telemetry",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }),
    );
    const [, request] = fetcher.mock.calls[0];
    expect(JSON.parse(request.body as string)).toMatchObject({
      eventId: event.eventId,
      payload: {
        boundary: "remote-api",
        event: "failed",
        provider: "openai",
        reason: "[redacted]",
      },
    });
    expect(request.body).not.toContain("abc123");
  });

  it("isolates local and remote failures from the caller", async () => {
    const storage = createThrowingStorage();
    const fetcher = vi.fn(async (_input: string, _init: RequestInit) => {
      throw new Error("network unavailable");
    });
    const event = createWorkshopOpenedTelemetry(
      createInitialWorkshopSession(),
      {
        occurredAt: "2026-07-06T08:03:00.000Z",
        source,
      },
    );
    const sink = createMissionControlTelemetrySink({
      endpoint: "/api/mission-control/telemetry",
      fetcher,
      storage,
    });

    await expect(sink.record(event)).resolves.toMatchObject({
      local: "failed",
      remote: "failed",
    });
  });

  it("keeps the local queue bounded", async () => {
    const sink = createMissionControlTelemetrySink({
      maxLocalEvents: 2,
      now: () => "2026-07-06T08:04:00.000Z",
    });

    await sink.record(
      createWorkshopOpenedTelemetry(createInitialWorkshopSession(), {
        occurredAt: "2026-07-06T08:04:01.000Z",
        source,
      }),
    );
    await sink.record(
      createWorkshopOpenedTelemetry(createInitialWorkshopSession(), {
        occurredAt: "2026-07-06T08:04:02.000Z",
        source,
      }),
    );
    await sink.record(
      createWorkshopOpenedTelemetry(createInitialWorkshopSession(), {
        occurredAt: "2026-07-06T08:04:03.000Z",
        source,
      }),
    );

    const records = readMissionControlTelemetryRecords();
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.event.occurredAt)).toEqual([
      "2026-07-06T08:04:02.000Z",
      "2026-07-06T08:04:03.000Z",
    ]);
  });

  it("redacts sensitive fields recursively without changing identifiers", () => {
    const event = createWorkshopOpenedTelemetry(
      {
        ...createInitialWorkshopSession(),
        title: "Customer churn risk review",
      },
      {
        occurredAt: "2026-07-06T08:05:00.000Z",
        source,
        correlationId: "correlation-1",
      },
    );

    expect(redactMissionControlTelemetryEvent(event)).toMatchObject({
      eventId: event.eventId,
      product: missionControlProductId,
      name: "workshop.opened",
      provenance: {
        workshopId: event.provenance.workshopId,
        workshopTitle: "[redacted]",
        correlationId: "correlation-1",
      },
      payload: {
        title: "[redacted]",
      },
    });
  });
});

function createThrowingStorage(): Storage {
  return {
    get length() {
      return 0;
    },
    clear: vi.fn(() => {
      throw new Error("storage failed");
    }),
    getItem: vi.fn(() => {
      throw new Error("storage failed");
    }),
    key: vi.fn(() => null),
    removeItem: vi.fn(() => {
      throw new Error("storage failed");
    }),
    setItem: vi.fn(() => {
      throw new Error("storage failed");
    }),
  };
}
