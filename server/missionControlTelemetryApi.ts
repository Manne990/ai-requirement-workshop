import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type MissionControlTelemetryBody = {
  schemaVersion?: unknown;
  product?: unknown;
  eventId?: unknown;
  name?: unknown;
  occurredAt?: unknown;
};

export type MissionControlTelemetryRecord = {
  receivedAt: string;
  event: Record<string, unknown>;
};

export type MissionControlTelemetryEnv = Record<string, string | undefined>;

const productId = "ai-requirement-workshop";
const defaultTelemetryFileName = "mission-control-telemetry.jsonl";
const maxTelemetryBodyBytes = 128 * 1024;

export async function appendMissionControlTelemetryRecord(
  body: unknown,
  env: MissionControlTelemetryEnv = process.env,
  now = () => new Date().toISOString(),
) {
  const event = normalizeMissionControlTelemetryEvent(body);
  const receivedAt = now();
  const filePath = missionControlTelemetryFilePath(env);
  const record: MissionControlTelemetryRecord = {
    receivedAt,
    event,
  };

  await mkdir(missionControlTelemetryDir(env), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");

  return {
    accepted: true,
    receivedAt,
    path: filePath,
  };
}

export async function readMissionControlTelemetryFile(
  env: MissionControlTelemetryEnv = process.env,
  limit = 100,
) {
  const filePath = missionControlTelemetryFilePath(env);
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));

  try {
    const raw = await readFile(filePath, "utf8");
    const records = raw
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as unknown;
          return isTelemetryRecord(parsed) ? [parsed] : [];
        } catch {
          return [];
        }
      });

    return {
      path: filePath,
      records: records.slice(-safeLimit),
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        path: filePath,
        records: [],
      };
    }

    throw error;
  }
}

export function normalizeMissionControlTelemetryEvent(body: unknown) {
  if (!isObject(body)) {
    throw new Error("Telemetry event must be a JSON object.");
  }

  const byteLength = Buffer.byteLength(JSON.stringify(body), "utf8");
  if (byteLength > maxTelemetryBodyBytes) {
    throw new Error("Telemetry event is too large.");
  }

  const candidate = body as MissionControlTelemetryBody;
  if (candidate.product !== productId) {
    throw new Error("Telemetry event product is not supported.");
  }

  for (const key of ["schemaVersion", "eventId", "name", "occurredAt"]) {
    if (
      typeof candidate[key as keyof MissionControlTelemetryBody] !== "string"
    ) {
      throw new Error(`Telemetry event is missing ${key}.`);
    }
  }

  return body;
}

export function missionControlTelemetryDir(
  env: MissionControlTelemetryEnv = process.env,
) {
  return (
    env.AI_REQUIREMENT_WORKSHOP_TELEMETRY_DIR?.trim() ||
    join(homedir(), ".gaia", "ai-requirement-workshop", "telemetry")
  );
}

export function missionControlTelemetryFilePath(
  env: MissionControlTelemetryEnv = process.env,
) {
  return join(missionControlTelemetryDir(env), defaultTelemetryFileName);
}

function isTelemetryRecord(
  value: unknown,
): value is MissionControlTelemetryRecord {
  return (
    isObject(value) &&
    typeof value.receivedAt === "string" &&
    isObject(value.event) &&
    typeof value.event.eventId === "string" &&
    typeof value.event.name === "string"
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
