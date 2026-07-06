import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialWorkshopSession } from "../domain/workshop";
import {
  createWorkshopRecord,
  type WorkshopRecord,
  type WorkshopSummary,
} from "./workshopStore";
import {
  createWorkshopRepository,
  localActiveWorkshopStore,
  localWorkshopRecordStore,
  type ActiveWorkshopStore,
  type WorkshopRecordStore,
} from "./workshopRepository";

const fallbackStorageKey = "ai-requirement-workshop:v3-workshop-records";

describe("workshopRepository", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("indexedDB", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves local workshop persistence through the repository boundary", async () => {
    const repository = createWorkshopRepository({
      recordStore: localWorkshopRecordStore,
      activeWorkshopStore: localActiveWorkshopStore,
    });
    const record = createWorkshopRecord(
      createInitialWorkshopSession(
        "2026-07-06T08:00:00.000Z",
        "local-repository-workshop",
      ),
    );

    await repository.saveRecord(record);
    repository.setActiveWorkshopId(record.id);

    expect(repository.getActiveWorkshopId()).toBe("local-repository-workshop");
    await expect(repository.loadRecord(record.id)).resolves.toMatchObject({
      id: "local-repository-workshop",
    });
    await expect(repository.listSummaries()).resolves.toEqual([
      expect.objectContaining({
        id: "local-repository-workshop",
        messageCount: 1,
      }),
    ]);
    expect(window.localStorage.getItem(fallbackStorageKey)).toContain(
      "local-repository-workshop",
    );
  });

  it("can compose a non-local record store with a separate active workshop preference", async () => {
    const summary: WorkshopSummary = {
      id: "server-workshop",
      title: "Server workshop",
      createdAt: "2026-07-06T08:00:00.000Z",
      updatedAt: "2026-07-06T08:01:00.000Z",
      artifactCount: 0,
      messageCount: 1,
      attachmentCount: 0,
    };
    const record = createWorkshopRecord(
      createInitialWorkshopSession(
        "2026-07-06T08:00:00.000Z",
        "server-workshop",
      ),
    );
    const recordStore: WorkshopRecordStore = {
      listSummaries: vi.fn(async () => [summary]),
      loadRecord: vi.fn(async () => record),
      saveRecord: vi.fn(async (_record: WorkshopRecord) => undefined),
    };
    let activeWorkshopId: string | null = null;
    const activeWorkshopStore: ActiveWorkshopStore = {
      getActiveWorkshopId: () => activeWorkshopId,
      setActiveWorkshopId: (workshopId) => {
        activeWorkshopId = workshopId;
      },
    };
    const repository = createWorkshopRepository({
      recordStore,
      activeWorkshopStore,
    });

    repository.setActiveWorkshopId("server-workshop");
    await repository.saveRecord(record);

    expect(repository.getActiveWorkshopId()).toBe("server-workshop");
    await expect(repository.listSummaries()).resolves.toEqual([summary]);
    await expect(repository.loadRecord("server-workshop")).resolves.toBe(
      record,
    );
    expect(recordStore.saveRecord).toHaveBeenCalledWith(record);
  });
});
