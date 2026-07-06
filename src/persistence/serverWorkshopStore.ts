import type { WorkshopRecord, WorkshopSummary } from "./workshopStore";
import type { WorkshopRecordStore } from "./workshopRepository";

export type WorkshopFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ServerWorkshopStoreOptions = {
  endpoint?: string;
  fetcher?: WorkshopFetch;
};

const defaultEndpoint = "/api/workshops";

export function createServerWorkshopStore(
  options: ServerWorkshopStoreOptions = {},
): WorkshopRecordStore {
  const endpoint = normalizeEndpoint(options.endpoint ?? defaultEndpoint);
  const fetcher = options.fetcher ?? globalThis.fetch;

  return {
    async listSummaries() {
      const response = await fetcher(endpoint, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw await createServerError(
          response,
          "Failed to list workshop records.",
        );
      }

      return readWorkshopSummaries(await readJson(response));
    },

    async loadRecord(id) {
      const response = await fetcher(recordUrl(endpoint, id), {
        headers: { Accept: "application/json" },
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw await createServerError(
          response,
          "Failed to load workshop record.",
        );
      }

      return readWorkshopRecord(await readJson(response));
    },

    async saveRecord(record) {
      const response = await fetcher(recordUrl(endpoint, record.id), {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ record }),
      });
      if (!response.ok) {
        throw await createServerError(
          response,
          "Failed to save workshop record.",
        );
      }
    },
  };
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.replace(/\/+$/, "") || defaultEndpoint;
}

function recordUrl(endpoint: string, id: string) {
  return `${endpoint}/${encodeURIComponent(id)}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error("Workshop server returned invalid JSON.");
  }
}

async function createServerError(response: Response, fallback: string) {
  const details = await readErrorMessage(response);
  return new Error(details ? `${fallback} ${details}` : fallback);
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.clone().json()) as unknown;
    if (isObject(payload)) {
      if (typeof payload.error === "string") {
        return payload.error;
      }
      if (typeof payload.message === "string") {
        return payload.message;
      }
    }
  } catch {
    // The HTTP status is enough context when the body is absent or not JSON.
  }

  return `HTTP ${response.status}`;
}

function readWorkshopSummaries(payload: unknown): WorkshopSummary[] {
  const summaries = Array.isArray(payload)
    ? payload
    : isObject(payload) && Array.isArray(payload.summaries)
      ? payload.summaries
      : null;

  if (!summaries?.every(isWorkshopSummary)) {
    throw new Error("Workshop server returned invalid summaries.");
  }

  return summaries;
}

function readWorkshopRecord(payload: unknown): WorkshopRecord {
  const record =
    isObject(payload) && "record" in payload ? payload.record : payload;

  if (!isWorkshopRecord(record)) {
    throw new Error("Workshop server returned an invalid record.");
  }

  return record;
}

function isWorkshopSummary(value: unknown): value is WorkshopSummary {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.artifactCount === "number" &&
    typeof value.messageCount === "number" &&
    typeof value.attachmentCount === "number"
  );
}

function isWorkshopRecord(value: unknown): value is WorkshopRecord {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    isObject(value.session) &&
    isObject(value.seenInsightIdsByParticipant)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
