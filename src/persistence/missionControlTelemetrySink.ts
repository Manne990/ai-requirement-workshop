import type { MissionControlTelemetryEvent } from "../domain/missionControlTelemetry";

type BrowserEnv = Record<string, string | undefined>;

type TelemetryFetcher = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status">>;

export type MissionControlTelemetryLocalRecord = {
  recordedAt: string;
  event: MissionControlTelemetryEvent;
};

export type MissionControlTelemetrySinkResult = {
  recordedAt: string;
  local: "stored" | "unavailable" | "failed";
  remote: "sent" | "skipped" | "failed";
  remoteStatus?: number;
};

export type MissionControlTelemetrySink = {
  record: (
    event: MissionControlTelemetryEvent,
  ) => Promise<MissionControlTelemetrySinkResult>;
};

export type MissionControlTelemetrySinkOptions = {
  endpoint?: string | null;
  env?: BrowserEnv;
  fetcher?: TelemetryFetcher;
  localStorageKey?: string;
  maxLocalEvents?: number;
  now?: () => string;
  storage?: Storage | null;
};

export const missionControlTelemetryStorageKey =
  "ai-requirement-workshop:mission-control-telemetry:v1";

const defaultMaxLocalEvents = 100;
const redactedValue = "[redacted]";
const sensitiveFieldNames = new Set([
  "apiKey",
  "authorization",
  "body",
  "content",
  "email",
  "prompt",
  "reason",
  "secret",
  "text",
  "title",
  "token",
  "workshopTitle",
]);

export function createMissionControlTelemetrySink({
  endpoint,
  env = import.meta.env,
  fetcher = typeof fetch === "function" ? fetch : undefined,
  localStorageKey = missionControlTelemetryStorageKey,
  maxLocalEvents = defaultMaxLocalEvents,
  now = () => new Date().toISOString(),
  storage = getBrowserLocalStorage(),
}: MissionControlTelemetrySinkOptions = {}): MissionControlTelemetrySink {
  const configuredEndpoint =
    endpoint === undefined
      ? normalizeEndpoint(env.VITE_MISSION_CONTROL_TELEMETRY_ENDPOINT)
      : normalizeEndpoint(endpoint);

  return {
    async record(event) {
      const recordedAt = now();
      const redactedEvent = redactMissionControlTelemetryEvent(event);
      const local = persistLocalTelemetryEvent({
        event: redactedEvent,
        localStorageKey,
        maxLocalEvents,
        recordedAt,
        storage,
      });
      const remoteResult = await postTelemetryEvent({
        endpoint: configuredEndpoint,
        event: redactedEvent,
        fetcher,
      });

      return {
        recordedAt,
        local,
        ...remoteResult,
      };
    },
  };
}

export async function recordMissionControlTelemetryEvent(
  event: MissionControlTelemetryEvent,
  options?: MissionControlTelemetrySinkOptions,
) {
  return createMissionControlTelemetrySink(options).record(event);
}

export function readMissionControlTelemetryRecords({
  localStorageKey = missionControlTelemetryStorageKey,
  storage = getBrowserLocalStorage(),
}: Pick<
  MissionControlTelemetrySinkOptions,
  "localStorageKey" | "storage"
> = {}): MissionControlTelemetryLocalRecord[] {
  if (!storage) {
    return [];
  }

  return loadLocalTelemetryRecords(storage, localStorageKey);
}

export function redactMissionControlTelemetryEvent(
  event: MissionControlTelemetryEvent,
): MissionControlTelemetryEvent {
  return redactValue(event) as MissionControlTelemetryEvent;
}

function persistLocalTelemetryEvent({
  event,
  localStorageKey,
  maxLocalEvents,
  recordedAt,
  storage,
}: {
  event: MissionControlTelemetryEvent;
  localStorageKey: string;
  maxLocalEvents: number;
  recordedAt: string;
  storage: Storage | null;
}): MissionControlTelemetrySinkResult["local"] {
  if (!storage) {
    return "unavailable";
  }

  try {
    const existingRecords = loadLocalTelemetryRecords(storage, localStorageKey);
    const nextRecords = [
      ...existingRecords,
      {
        recordedAt,
        event,
      },
    ].slice(-Math.max(1, maxLocalEvents));
    storage.setItem(localStorageKey, JSON.stringify(nextRecords));
    return "stored";
  } catch {
    return "failed";
  }
}

async function postTelemetryEvent({
  endpoint,
  event,
  fetcher,
}: {
  endpoint: string | null;
  event: MissionControlTelemetryEvent;
  fetcher?: TelemetryFetcher;
}): Promise<
  Pick<MissionControlTelemetrySinkResult, "remote" | "remoteStatus">
> {
  if (!endpoint) {
    return { remote: "skipped" };
  }

  if (!fetcher) {
    return { remote: "failed" };
  }

  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    });

    return {
      remote: response.ok ? "sent" : "failed",
      remoteStatus: response.status,
    };
  } catch {
    return { remote: "failed" };
  }
}

function loadLocalTelemetryRecords(
  storage: Storage,
  localStorageKey: string,
): MissionControlTelemetryLocalRecord[] {
  try {
    const raw = storage.getItem(localStorageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? (parsed.filter(
          isLocalTelemetryRecord,
        ) as MissionControlTelemetryLocalRecord[])
      : [];
  } catch {
    return [];
  }
}

function isLocalTelemetryRecord(
  value: unknown,
): value is MissionControlTelemetryLocalRecord {
  return (
    isObject(value) &&
    typeof value.recordedAt === "string" &&
    isObject(value.event) &&
    typeof value.event.eventId === "string" &&
    typeof value.event.name === "string"
  );
}

function redactValue(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    return key && sensitiveFieldNames.has(key) ? redactedValue : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

function normalizeEndpoint(endpoint?: string | null) {
  const normalized = endpoint?.trim();
  return normalized ? normalized : null;
}

function getBrowserLocalStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
