import type { WorkshopSession } from "../domain/workshop";

export type SeenInsightIdsByParticipant = Record<string, string[]>;

export type WorkshopRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  session: WorkshopSession;
  seenInsightIdsByParticipant: SeenInsightIdsByParticipant;
};

export type WorkshopSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  artifactCount: number;
  messageCount: number;
  attachmentCount: number;
};

export type WorkshopRecordExport = {
  schema_version: 1;
  kind: "AI_REQUIREMENT_WORKSHOP_RECORD_EXPORT";
  exportedAt: string;
  record: WorkshopRecord;
};

const dbName = "ai-requirement-workshop";
const dbVersion = 1;
const workshopStoreName = "workshops";
const fallbackStorageKey = "ai-requirement-workshop:v3-workshop-records";
const activeWorkshopStorageKey = "ai-requirement-workshop:v3-active-workshop";

export async function listWorkshopSummaries(): Promise<WorkshopSummary[]> {
  const records = await loadAllWorkshopRecords();
  return records
    .map(toWorkshopSummary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadWorkshopRecord(id: string) {
  if (canUseIndexedDb()) {
    const db = await openDatabase();
    return getRecordFromDb(db, id);
  }

  return loadFallbackRecords().find((record) => record.id === id) ?? null;
}

export async function saveWorkshopRecord(record: WorkshopRecord) {
  if (canUseIndexedDb()) {
    const db = await openDatabase();
    await putRecordInDb(db, record);
    return;
  }

  const records = loadFallbackRecords().filter(
    (candidate) => candidate.id !== record.id,
  );
  records.push(record);
  window.localStorage.setItem(fallbackStorageKey, JSON.stringify(records));
}

export function getActiveWorkshopId() {
  return window.localStorage.getItem(activeWorkshopStorageKey);
}

export function setActiveWorkshopId(workshopId: string) {
  window.localStorage.setItem(activeWorkshopStorageKey, workshopId);
}

export function createWorkshopRecord(
  session: WorkshopSession,
  seenInsightIdsByParticipant: SeenInsightIdsByParticipant = {},
): WorkshopRecord {
  const firstHumanMessage = session.messages.find(
    (message) => message.kind === "human-input",
  );
  const title = deriveWorkshopTitle(session, firstHumanMessage?.body);

  return {
    id: session.id,
    title,
    createdAt: session.messages[0]?.createdAt ?? session.updatedAt,
    updatedAt: session.updatedAt,
    session: {
      ...session,
      title,
      attachments: session.attachments ?? [],
      prototypes: session.prototypes ?? [],
    },
    seenInsightIdsByParticipant,
  };
}

export function toWorkshopSummary(record: WorkshopRecord): WorkshopSummary {
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    artifactCount: record.session.artifacts.length,
    messageCount: record.session.messages.length,
    attachmentCount: record.session.attachments?.length ?? 0,
  };
}

export function createWorkshopRecordExport(
  record: WorkshopRecord,
  exportedAt = new Date().toISOString(),
): WorkshopRecordExport {
  return {
    schema_version: 1,
    kind: "AI_REQUIREMENT_WORKSHOP_RECORD_EXPORT",
    exportedAt,
    record,
  };
}

export function parseWorkshopRecordExport(raw: string): WorkshopRecord {
  const parsed = JSON.parse(raw) as unknown;
  const record = isExportEnvelope(parsed)
    ? parsed.record
    : isObject(parsed) && "record" in parsed
      ? (parsed.record as unknown)
      : parsed;

  return normalizeWorkshopRecord(record);
}

async function loadAllWorkshopRecords() {
  if (canUseIndexedDb()) {
    const db = await openDatabase();
    return getAllRecordsFromDb(db);
  }

  return loadFallbackRecords();
}

function canUseIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(workshopStoreName)) {
        db.createObjectStore(workshopStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getRecordFromDb(
  db: IDBDatabase,
  id: string,
): Promise<WorkshopRecord | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(workshopStoreName, "readonly");
    const request = transaction.objectStore(workshopStoreName).get(id);
    request.onsuccess = () =>
      resolve((request.result as WorkshopRecord | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

function getAllRecordsFromDb(db: IDBDatabase): Promise<WorkshopRecord[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(workshopStoreName, "readonly");
    const request = transaction.objectStore(workshopStoreName).getAll();
    request.onsuccess = () => resolve(request.result as WorkshopRecord[]);
    request.onerror = () => reject(request.error);
  });
}

function putRecordInDb(db: IDBDatabase, record: WorkshopRecord) {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(workshopStoreName, "readwrite");
    transaction.objectStore(workshopStoreName).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function loadFallbackRecords(): WorkshopRecord[] {
  try {
    const raw = window.localStorage.getItem(fallbackStorageKey);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw) as WorkshopRecord[];
  } catch {
    return [];
  }
}

function deriveWorkshopTitle(
  session: WorkshopSession,
  firstHumanBody?: string,
) {
  if (firstHumanBody?.trim()) {
    const normalized = firstHumanBody.replace(/\s+/g, " ").trim();
    return normalized.length > 54
      ? `${normalized.slice(0, 51)}...`
      : normalized;
  }

  if (session.title && session.title !== "AI Requirement Workshop") {
    return session.title;
  }

  return `Workshop ${formatDateTime(session.updatedAt)}`;
}

function isExportEnvelope(value: unknown): value is WorkshopRecordExport {
  return (
    isObject(value) &&
    value.schema_version === 1 &&
    value.kind === "AI_REQUIREMENT_WORKSHOP_RECORD_EXPORT" &&
    typeof value.exportedAt === "string" &&
    "record" in value
  );
}

function normalizeWorkshopRecord(value: unknown): WorkshopRecord {
  if (!isObject(value)) {
    throw new Error("Workshop import is not an object.");
  }

  const session = value.session;
  if (!isObject(session)) {
    throw new Error("Workshop import is missing session state.");
  }

  const id = stringOr(value.id, stringOr(session.id));
  if (!id) {
    throw new Error("Workshop import is missing an id.");
  }

  const updatedAt = stringOr(value.updatedAt, stringOr(session.updatedAt));
  const createdAt = stringOr(value.createdAt, updatedAt);
  const title = stringOr(value.title, stringOr(session.title)) || "Workshop";

  return {
    id,
    title,
    createdAt,
    updatedAt,
    session: {
      ...(session as Partial<WorkshopSession>),
      id,
      title,
      participants: arrayOr(session.participants),
      messages: arrayOr(session.messages),
      attachments: arrayOr(session.attachments),
      artifacts: arrayOr(session.artifacts),
      links: arrayOr(session.links),
      prototypes: arrayOr(session.prototypes),
      visualizationMode: normalizeVisualizationMode(session.visualizationMode),
      followDiscussion:
        typeof session.followDiscussion === "boolean"
          ? session.followDiscussion
          : true,
      updatedAt,
    } as WorkshopSession,
    seenInsightIdsByParticipant: normalizeSeenInsightIds(
      value.seenInsightIdsByParticipant,
    ),
  };
}

function normalizeSeenInsightIds(value: unknown): SeenInsightIdsByParticipant {
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

function normalizeVisualizationMode(
  value: unknown,
): WorkshopSession["visualizationMode"] {
  return value === "journey" || value === "requirements" || value === "risks"
    ? value
    : "process";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOr(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function arrayOr<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function formatDateTime(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}
