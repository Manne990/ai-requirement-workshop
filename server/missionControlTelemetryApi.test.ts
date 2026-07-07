import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendMissionControlTelemetryRecord,
  isMissionControlTelemetryApiEnabled,
  missionControlTelemetryFilePath,
  normalizeMissionControlTelemetryEvent,
  readMissionControlTelemetryFile,
} from "./missionControlTelemetryApi.js";

const tempDirs: string[] = [];

describe("missionControlTelemetryApi", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("appends telemetry records to a local JSONL file", async () => {
    const env = await tempTelemetryEnv();
    const event = telemetryEvent("event-1", "workshop.opened");

    await expect(
      appendMissionControlTelemetryRecord(
        event,
        env,
        () => "2026-07-06T21:00:00.000Z",
      ),
    ).resolves.toMatchObject({
      accepted: true,
      receivedAt: "2026-07-06T21:00:00.000Z",
      path: missionControlTelemetryFilePath(env),
    });

    const raw = await readFile(missionControlTelemetryFilePath(env), "utf8");
    expect(
      raw
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([
      {
        receivedAt: "2026-07-06T21:00:00.000Z",
        event,
      },
    ]);
  });

  it("reads the latest telemetry records with a bounded limit", async () => {
    const env = await tempTelemetryEnv();

    await appendMissionControlTelemetryRecord(
      telemetryEvent("event-1", "workshop.opened"),
      env,
      () => "2026-07-06T21:00:00.000Z",
    );
    await appendMissionControlTelemetryRecord(
      telemetryEvent("event-2", "message.sent"),
      env,
      () => "2026-07-06T21:01:00.000Z",
    );

    await expect(readMissionControlTelemetryFile(env, 1)).resolves.toEqual({
      path: missionControlTelemetryFilePath(env),
      records: [
        {
          receivedAt: "2026-07-06T21:01:00.000Z",
          event: telemetryEvent("event-2", "message.sent"),
        },
      ],
    });
  });

  it("rejects unsupported products and oversized telemetry events", () => {
    expect(() =>
      normalizeMissionControlTelemetryEvent({
        ...telemetryEvent("event-1", "workshop.opened"),
        product: "other-product",
      }),
    ).toThrow("Telemetry event product is not supported.");

    expect(() =>
      normalizeMissionControlTelemetryEvent({
        ...telemetryEvent("event-2", "message.sent"),
        payload: { content: "x".repeat(130 * 1024) },
      }),
    ).toThrow("Telemetry event is too large.");
  });

  it("returns an empty list before the telemetry file exists", async () => {
    const env = await tempTelemetryEnv();

    await expect(readMissionControlTelemetryFile(env)).resolves.toEqual({
      path: missionControlTelemetryFilePath(env),
      records: [],
    });
  });

  it("fails closed for unauthenticated telemetry in Vercel production", () => {
    expect(isMissionControlTelemetryApiEnabled({})).toBe(true);
    expect(
      isMissionControlTelemetryApiEnabled({ NODE_ENV: "production" }),
    ).toBe(true);
    expect(
      isMissionControlTelemetryApiEnabled({ VERCEL_ENV: "production" }),
    ).toBe(false);
  });
});

async function tempTelemetryEnv() {
  const dir = await mkdtemp(join(tmpdir(), "mission-control-telemetry-"));
  tempDirs.push(dir);
  return {
    AI_REQUIREMENT_WORKSHOP_TELEMETRY_DIR: dir,
  };
}

function telemetryEvent(eventId: string, name: string) {
  return {
    schemaVersion: "mission-control.telemetry.v1",
    product: "ai-requirement-workshop",
    eventId,
    name,
    occurredAt: "2026-07-06T20:59:00.000Z",
    source: {
      product: "ai-requirement-workshop",
      surface: "workshop-room",
      trigger: "user",
      runtime: "test",
    },
    provenance: {
      workshopId: "workshop-1",
    },
    payload: {},
    kpis: [],
  };
}
