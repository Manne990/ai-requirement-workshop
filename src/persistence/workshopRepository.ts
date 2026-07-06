import {
  getActiveWorkshopId,
  listWorkshopSummaries,
  loadWorkshopRecord,
  saveWorkshopRecord,
  setActiveWorkshopId,
  type WorkshopRecord,
  type WorkshopSummary,
} from "./workshopStore";
import {
  createSupabaseWorkshopRecordStore,
  isConfiguredSupabaseWorkshopStore,
} from "./supabaseWorkshopStore";

export type WorkshopRecordStore = {
  listSummaries: () => Promise<WorkshopSummary[]>;
  loadRecord: (id: string) => Promise<WorkshopRecord | null>;
  saveRecord: (record: WorkshopRecord) => Promise<void>;
};

export type ActiveWorkshopStore = {
  getActiveWorkshopId: () => string | null;
  setActiveWorkshopId: (workshopId: string) => void;
};

export type WorkshopRepository = WorkshopRecordStore & ActiveWorkshopStore;

export type WorkshopRepositoryOptions = {
  recordStore: WorkshopRecordStore;
  activeWorkshopStore: ActiveWorkshopStore;
};

export function createWorkshopRepository({
  recordStore,
  activeWorkshopStore,
}: WorkshopRepositoryOptions): WorkshopRepository {
  return {
    listSummaries: () => recordStore.listSummaries(),
    loadRecord: (id) => recordStore.loadRecord(id),
    saveRecord: (record) => recordStore.saveRecord(record),
    getActiveWorkshopId: () => activeWorkshopStore.getActiveWorkshopId(),
    setActiveWorkshopId: (workshopId) =>
      activeWorkshopStore.setActiveWorkshopId(workshopId),
  };
}

export const localWorkshopRecordStore: WorkshopRecordStore = {
  listSummaries: listWorkshopSummaries,
  loadRecord: loadWorkshopRecord,
  saveRecord: saveWorkshopRecord,
};

export const localActiveWorkshopStore: ActiveWorkshopStore = {
  getActiveWorkshopId,
  setActiveWorkshopId,
};

export const workshopRepository = createWorkshopRepository({
  recordStore: isConfiguredSupabaseWorkshopStore()
    ? createSupabaseWorkshopRecordStore()
    : localWorkshopRecordStore,
  activeWorkshopStore: localActiveWorkshopStore,
});
