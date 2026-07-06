import {
  createWorkshopRecordExport,
  type WorkshopRecord,
} from "./workshopStore";

export type DiskBackupResult = {
  status: "saved" | "unavailable" | "failed";
  backedUpAt?: string;
  message: string;
};

export async function mirrorWorkshopRecordToDisk(
  record: WorkshopRecord,
): Promise<DiskBackupResult> {
  try {
    const response = await fetch("/api/workshops/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createWorkshopRecordExport(record)),
    });

    if (response.status === 404) {
      return {
        status: "unavailable",
        message: "Saved in browser. Disk backup is unavailable here.",
      };
    }

    const payload = (await response.json().catch(() => ({}))) as {
      backedUpAt?: unknown;
      message?: unknown;
      error?: unknown;
    };

    if (!response.ok) {
      return {
        status: "failed",
        message:
          typeof payload.error === "string"
            ? payload.error
            : "Saved in browser. Disk backup failed.",
      };
    }

    return {
      status: "saved",
      backedUpAt:
        typeof payload.backedUpAt === "string"
          ? payload.backedUpAt
          : new Date().toISOString(),
      message:
        typeof payload.message === "string"
          ? payload.message
          : "Saved in browser and backed up to disk.",
    };
  } catch {
    return {
      status: "unavailable",
      message: "Saved in browser. Disk backup is unavailable here.",
    };
  }
}
