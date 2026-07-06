import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type WorkshopRecordsApiRequest = {
  method?: string;
  url?: string;
  body?: unknown;
};

export type WorkshopRecordsApiResponse = {
  statusCode: number;
  body: unknown;
};

export type WorkshopRecordsApiEnv = Record<string, string | undefined>;

export type ServerWorkshopRecord = {
  id: string;
  organizationId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  session: {
    id: string;
    title: string;
    createdAt?: string;
    updatedAt: string;
    messages: unknown[];
    artifacts: unknown[];
    attachments?: unknown[];
    prototypes?: unknown[];
    [key: string]: unknown;
  };
  requirements?: unknown[];
  auditEvents?: unknown[];
  seenInsightIdsByParticipant: Record<string, string[]>;
};

export type ServerWorkshopSummary = {
  id: string;
  organizationId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  artifactCount: number;
  messageCount: number;
  attachmentCount: number;
};

export async function handleWorkshopRecordsRequest(
  request: WorkshopRecordsApiRequest,
  env: WorkshopRecordsApiEnv = process.env,
): Promise<WorkshopRecordsApiResponse> {
  const method = request.method ?? "GET";
  const recordId = readRecordId(request.url);

  try {
    if (!recordId && method === "GET") {
      const records = await readAllWorkshopRecords(env);
      return {
        statusCode: 200,
        body: {
          summaries: records
            .map(toServerWorkshopSummary)
            .sort((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt),
            ),
        },
      };
    }

    if (!recordId) {
      return methodNotAllowed();
    }

    if (method === "GET") {
      const record = await readWorkshopRecord(recordId, env);
      return record
        ? { statusCode: 200, body: { record } }
        : { statusCode: 404, body: { error: "Workshop not found." } };
    }

    if (method === "PUT") {
      const record = normalizeServerWorkshopRecord(request.body);
      if (record.id !== recordId) {
        return {
          statusCode: 400,
          body: { error: "Workshop URL id does not match record id." },
        };
      }

      await writeWorkshopRecord(record, env);
      return {
        statusCode: 200,
        body: { saved: true, recordId: record.id, updatedAt: record.updatedAt },
      };
    }

    return methodNotAllowed();
  } catch (error) {
    return {
      statusCode: 400,
      body: {
        error:
          error instanceof Error
            ? error.message
            : "Workshop records request failed.",
      },
    };
  }
}

export function workshopRecordsDir(env: WorkshopRecordsApiEnv = process.env) {
  return (
    env.AI_REQUIREMENT_WORKSHOP_SERVER_STORE_DIR?.trim() ||
    join(homedir(), ".gaia", "ai-requirement-workshop", "server-workshops")
  );
}

async function readAllWorkshopRecords(env: WorkshopRecordsApiEnv) {
  const dir = workshopRecordsDir(env);

  try {
    const fileNames = await readdir(dir);
    const records = await Promise.all(
      fileNames
        .filter((fileName) => fileName.endsWith(".json"))
        .map(async (fileName) => readWorkshopRecordFile(join(dir, fileName))),
    );
    return records.flatMap((record) => (record ? [record] : []));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readWorkshopRecord(
  recordId: string,
  env: WorkshopRecordsApiEnv,
) {
  return readWorkshopRecordFile(workshopRecordPath(recordId, env));
}

async function readWorkshopRecordFile(filePath: string) {
  try {
    return normalizeServerWorkshopRecord(
      JSON.parse(await readFile(filePath, "utf8")),
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writeWorkshopRecord(
  record: ServerWorkshopRecord,
  env: WorkshopRecordsApiEnv,
) {
  const dir = workshopRecordsDir(env);
  const targetPath = workshopRecordPath(record.id, env);
  const tempPath = join(dir, `.${safeFileName(record.id)}.${Date.now()}.tmp`);

  await mkdir(dir, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(tempPath, targetPath);
}

function normalizeServerWorkshopRecord(body: unknown): ServerWorkshopRecord {
  const record = isObject(body) && "record" in body ? body.record : body;
  if (!isObject(record)) {
    throw new Error("Workshop record must be a JSON object.");
  }

  const session = record.session;
  if (!isObject(session)) {
    throw new Error("Workshop record is missing session state.");
  }

  const id = stringOr(record.id, stringOr(session.id));
  const organizationId = stringOr(record.organizationId);
  if (!id) {
    throw new Error("Workshop record is missing id.");
  }
  if (!organizationId) {
    throw new Error("Server-backed workshop records require organizationId.");
  }

  const updatedAt = stringOr(record.updatedAt, stringOr(session.updatedAt));
  const createdAt = stringOr(
    record.createdAt,
    firstMessageCreatedAt(session.messages) || updatedAt,
  );
  const title = stringOr(record.title, stringOr(session.title)) || "Workshop";

  return {
    id,
    organizationId,
    title,
    createdAt,
    updatedAt,
    session: {
      ...session,
      id,
      title,
      messages: arrayOr(session.messages),
      artifacts: arrayOr(session.artifacts),
      attachments: arrayOr(session.attachments),
      prototypes: arrayOr(session.prototypes),
      updatedAt,
    },
    requirements: arrayOr(record.requirements),
    auditEvents: arrayOr(record.auditEvents),
    seenInsightIdsByParticipant: normalizeSeenInsights(
      record.seenInsightIdsByParticipant,
    ),
  };
}

function toServerWorkshopSummary(
  record: ServerWorkshopRecord,
): ServerWorkshopSummary {
  return {
    id: record.id,
    organizationId: record.organizationId,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    artifactCount: record.session.artifacts.length,
    messageCount: record.session.messages.length,
    attachmentCount: record.session.attachments?.length ?? 0,
  };
}

function readRecordId(url: string | undefined) {
  const pathname = url?.split("?")[0] ?? "";
  const match = /^\/api\/workshops\/([^/]+)$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function workshopRecordPath(recordId: string, env: WorkshopRecordsApiEnv) {
  return join(workshopRecordsDir(env), `${safeFileName(recordId)}.json`);
}

function methodNotAllowed(): WorkshopRecordsApiResponse {
  return { statusCode: 405, body: { error: "Method not allowed." } };
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "workshop";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOr(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function arrayOr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstMessageCreatedAt(messages: unknown) {
  if (!Array.isArray(messages)) {
    return "";
  }

  const first = messages[0];
  return isObject(first) ? stringOr(first.createdAt) : "";
}

function normalizeSeenInsights(value: unknown): Record<string, string[]> {
  if (!isObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([participantId, ids]) => [
      participantId,
      Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === "string")
        : [],
    ]),
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
