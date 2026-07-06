import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialWorkshopSession } from "../domain/workshop";
import { createWorkshopRecord } from "./workshopStore";
import { mirrorWorkshopRecordToDisk } from "./workshopBackup";

describe("workshopBackup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a successful disk backup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          backedUpAt: "2026-07-06T08:30:00.000Z",
          message: "Saved in browser and backed up to disk.",
        }),
      ),
    );

    const result = await mirrorWorkshopRecordToDisk(
      createWorkshopRecord(createInitialWorkshopSession()),
    );

    expect(result.status).toBe("saved");
    expect(result.backedUpAt).toBe("2026-07-06T08:30:00.000Z");
  });

  it("keeps browser persistence valid when disk backup is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 404)),
    );

    const result = await mirrorWorkshopRecordToDisk(
      createWorkshopRecord(createInitialWorkshopSession()),
    );

    expect(result.status).toBe("unavailable");
    expect(result.message).toMatch(/saved in browser/i);
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
