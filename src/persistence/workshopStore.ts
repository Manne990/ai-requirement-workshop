import { redactSensitiveText } from "../domain/security";
import type { AuditEvent } from "../domain/audit";
import {
  createProductionAttachmentRecord,
  type ProductionAttachmentRecord,
} from "../domain/attachmentSecurity";
import type {
  AttachmentDraft,
  WorkshopAttachment,
} from "../domain/attachments";
import type { Requirement } from "../domain/requirements";
import type { WorkshopArtifact, WorkshopSession } from "../domain/workshop";

export type SeenInsightIdsByParticipant = Record<string, string[]>;

export type WorkshopRecord = {
  id: string;
  organizationId?: string;
  revision?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  session: WorkshopSession;
  requirements: Requirement[];
  auditEvents: AuditEvent[];
  seenInsightIdsByParticipant: SeenInsightIdsByParticipant;
};

export type WorkshopSummary = {
  id: string;
  organizationId?: string;
  revision?: string;
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
  provenance: WorkshopRecordExportProvenance;
  record: WorkshopRecord;
};

export type WorkshopRecordExportProvenance = {
  source: "workshop-store";
  generator: "createWorkshopRecordExport";
  exportedAt: string;
  workshopId: string;
  workshopUpdatedAt: string;
  counts: {
    messages: number;
    artifacts: number;
    attachments: number;
    prototypes: number;
    prototypeVersions: number;
  };
};

export type CreateWorkshopRecordOptions = {
  organizationId?: string;
  requirements?: Requirement[];
  auditEvents?: AuditEvent[];
};

export type SanitizeImportedWorkshopRecordOptions = {
  organizationId?: string;
  importedByUserId?: string;
  importedAt?: string;
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
  options: CreateWorkshopRecordOptions = {},
): WorkshopRecord {
  const firstHumanMessage = session.messages.find(
    (message) => message.kind === "human-input",
  );
  const title = deriveWorkshopTitle(session, firstHumanMessage?.body);

  return {
    id: session.id,
    organizationId: normalizeOptionalText(options.organizationId),
    title,
    createdAt: session.messages[0]?.createdAt ?? session.updatedAt,
    updatedAt: session.updatedAt,
    session: {
      ...session,
      title,
      attachments: session.attachments ?? [],
      prototypes: session.prototypes ?? [],
    },
    requirements: options.requirements ?? [],
    auditEvents: options.auditEvents ?? [],
    seenInsightIdsByParticipant,
  };
}

export function toWorkshopSummary(record: WorkshopRecord): WorkshopSummary {
  return {
    id: record.id,
    organizationId: record.organizationId,
    revision: record.revision,
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
    provenance: createWorkshopRecordExportProvenance(record, exportedAt),
    record: redactWorkshopRecordForExport(record),
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

export function sanitizeImportedWorkshopRecord(
  record: WorkshopRecord,
  options: SanitizeImportedWorkshopRecordOptions = {},
): WorkshopRecord {
  const importedAt = options.importedAt ?? new Date().toISOString();
  const organizationId =
    normalizeOptionalText(options.organizationId) ??
    record.organizationId ??
    "local-import";
  const importedByUserId =
    normalizeOptionalText(options.importedByUserId) ?? "import";
  const session = {
    ...record.session,
    artifacts: record.session.artifacts.map(sanitizeImportedArtifact),
    attachments: sanitizeImportedAttachments(record, {
      organizationId,
      importedAt,
      importedByUserId,
    }),
    prototypes: [],
    updatedAt: importedAt,
  };

  return {
    ...record,
    organizationId,
    updatedAt: importedAt,
    session,
    requirements: [],
    auditEvents: [],
    seenInsightIdsByParticipant: {},
  };
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

function sanitizeImportedArtifact(
  artifact: WorkshopArtifact,
): WorkshopArtifact {
  return {
    ...artifact,
    status: "draft",
    tags: [
      ...artifact.tags.filter((tag) => tag !== "accepted"),
      "imported-export",
      "requires-local-review",
    ].slice(0, 10),
  };
}

function sanitizeImportedAttachments(
  record: WorkshopRecord,
  context: {
    organizationId: string;
    importedAt: string;
    importedByUserId: string;
  },
): WorkshopAttachment[] {
  return record.session.attachments.map((attachment, index) => {
    const normalized = normalizeImportedAttachment(attachment, index, record);

    return createProductionAttachmentRecord({
      draft: normalized.draft,
      id: normalized.id,
      organizationId: context.organizationId,
      workshopId: record.id,
      sourceMessageId: normalized.sourceMessageId,
      uploadedByUserId: context.importedByUserId,
      createdAt: normalized.createdAt || context.importedAt,
      source: "import",
      storage: {
        provider: "imported-export",
        status: "metadata-only",
        storedAt: context.importedAt,
      },
    }) satisfies ProductionAttachmentRecord;
  });
}

function normalizeImportedAttachment(
  attachment: WorkshopAttachment,
  index: number,
  record: WorkshopRecord,
) {
  return {
    id: boundedString(attachment.id, 120, `attachment-import-${index + 1}`),
    sourceMessageId: boundedString(
      attachment.sourceMessageId,
      120,
      `import:${record.id}`,
    ),
    createdAt: boundedString(attachment.createdAt, 40, record.updatedAt),
    draft: {
      name: boundedString(attachment.name, 180),
      mimeType: boundedString(attachment.mimeType, 120),
      size: finiteNumber(attachment.size),
      extractedText: boundedString(attachment.extractedText, 6000),
      summary: boundedString(attachment.summary, 1000),
      status:
        attachment.status === "extracted" ||
        attachment.status === "metadata-only"
          ? attachment.status
          : "metadata-only",
      tags: sanitizeImportedAttachmentTags(attachment.tags),
    } satisfies AttachmentDraft,
  };
}

function sanitizeImportedAttachmentTags(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter((tag) => tag && !/^(security|storage):/i.test(tag))
        .map((tag) => boundedString(tag, 80))
        .slice(0, 8)
    : [];
}

function boundedString(value: unknown, maxLength: number, fallback = "") {
  const normalized =
    typeof value === "string" && value.trim() ? value.trim() : fallback;
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
    request.onsuccess = () => {
      const result = request.result as unknown;
      resolve(result ? normalizeWorkshopRecord(result) : null);
    };
    request.onerror = () => reject(request.error);
  });
}

function getAllRecordsFromDb(db: IDBDatabase): Promise<WorkshopRecord[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(workshopStoreName, "readonly");
    const request = transaction.objectStore(workshopStoreName).getAll();
    request.onsuccess = () =>
      resolve(normalizeWorkshopRecordList(request.result));
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
    return normalizeWorkshopRecordList(JSON.parse(raw) as unknown);
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

function redactWorkshopRecordForExport(record: WorkshopRecord): WorkshopRecord {
  return redactSensitiveExportValue(record) as WorkshopRecord;
}

function redactSensitiveExportValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitiveExportValue);
  }

  if (!isObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      redactSensitiveExportValue(nested),
    ]),
  );
}

function createWorkshopRecordExportProvenance(
  record: WorkshopRecord,
  exportedAt: string,
): WorkshopRecordExportProvenance {
  return {
    source: "workshop-store",
    generator: "createWorkshopRecordExport",
    exportedAt,
    workshopId: record.id,
    workshopUpdatedAt: record.updatedAt,
    counts: {
      messages: record.session.messages.length,
      artifacts: record.session.artifacts.length,
      attachments: record.session.attachments?.length ?? 0,
      prototypes: record.session.prototypes?.length ?? 0,
      prototypeVersions: (record.session.prototypes ?? []).reduce(
        (count, prototype) => count + prototype.versions.length,
        0,
      ),
    },
  };
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
    organizationId: normalizeOptionalText(value.organizationId),
    revision: normalizeOptionalText(value.revision),
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
    requirements: arrayOr(value.requirements) as Requirement[],
    auditEvents: arrayOr(value.auditEvents) as AuditEvent[],
  };
}

function normalizeWorkshopRecordList(value: unknown): WorkshopRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate) => {
    try {
      return [normalizeWorkshopRecord(candidate)];
    } catch {
      return [];
    }
  });
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

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
