import { describe, expect, it, vi } from "vitest";
import { createInitialWorkshopSession } from "../domain/workshop";
import { createWorkshopRecord, toWorkshopSummary } from "./workshopStore";
import {
  createServerWorkshopStore,
  isConfiguredServerWorkshopStore,
  serverWorkshopEndpoint,
  type WorkshopFetch,
} from "./serverWorkshopStore";

describe("serverWorkshopStore", () => {
  it("is enabled only when a workshop record endpoint is configured", () => {
    expect(isConfiguredServerWorkshopStore({})).toBe(false);
    expect(
      isConfiguredServerWorkshopStore({
        VITE_WORKSHOP_RECORD_ENDPOINT: " /api/workshops ",
      }),
    ).toBe(true);
    expect(
      isConfiguredServerWorkshopStore({
        MODE: "production",
        PROD: true,
        VITE_WORKSHOP_RECORD_ENDPOINT: " /api/workshops ",
      }),
    ).toBe(false);
    expect(
      isConfiguredServerWorkshopStore({
        MODE: "production",
        PROD: "true",
        VITE_WORKSHOP_RECORD_ENDPOINT: " /api/workshops ",
        VITE_ALLOW_UNAUTHENTICATED_WORKSHOP_RECORD_ENDPOINT: "true",
      }),
    ).toBe(true);
    expect(
      serverWorkshopEndpoint({
        VITE_WORKSHOP_RECORD_ENDPOINT: " /api/workshops ",
      }),
    ).toBe("/api/workshops");
  });

  it("lists workshop summaries from a JSON server endpoint", async () => {
    const record = createWorkshopRecord(
      createInitialWorkshopSession(
        "2026-07-06T08:00:00.000Z",
        "server-list-workshop",
      ),
    );
    const summary = toWorkshopSummary(record);
    const fetcher = vi.fn<WorkshopFetch>(async () =>
      jsonResponse({ summaries: [summary] }),
    );
    const store = createServerWorkshopStore({
      endpoint: "/api/workshops/",
      fetcher,
    });

    await expect(store.listSummaries()).resolves.toEqual([summary]);
    expect(fetcher).toHaveBeenCalledWith("/api/workshops", {
      headers: { Accept: "application/json" },
    });
  });

  it("loads a workshop record and returns null for server misses", async () => {
    const record = createWorkshopRecord(
      createInitialWorkshopSession(
        "2026-07-06T08:00:00.000Z",
        "server-load-workshop",
      ),
    );
    const fetcher = vi
      .fn<WorkshopFetch>()
      .mockResolvedValueOnce(jsonResponse({ record }))
      .mockResolvedValueOnce(jsonResponse({ error: "Not found" }, 404));
    const store = createServerWorkshopStore({ fetcher });

    await expect(store.loadRecord(record.id)).resolves.toEqual(record);
    await expect(store.loadRecord("missing workshop")).resolves.toBeNull();
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/workshops/server-load-workshop",
      { headers: { Accept: "application/json" } },
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/workshops/missing%20workshop",
      { headers: { Accept: "application/json" } },
    );
  });

  it("saves records with a credential-free JSON PUT request", async () => {
    const record = createWorkshopRecord(
      createInitialWorkshopSession(
        "2026-07-06T08:00:00.000Z",
        "server-save-workshop",
      ),
    );
    const fetcher = vi.fn<WorkshopFetch>(async () =>
      jsonResponse({ ok: true }),
    );
    const store = createServerWorkshopStore({ fetcher });

    await store.saveRecord(record);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/workshops/server-save-workshop");
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(init?.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(String(init?.body))).toEqual({ record });
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
