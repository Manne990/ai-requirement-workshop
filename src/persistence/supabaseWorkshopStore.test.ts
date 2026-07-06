import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createInitialWorkshopSession,
  submitHumanMessage,
} from "../domain/workshop";
import { createWorkshopRecord } from "./workshopStore";
import {
  createSupabaseWorkshopRecordStore,
  isConfiguredSupabaseWorkshopStore,
} from "./supabaseWorkshopStore";

type TableName = "profiles" | "organizations" | "memberships" | "workshops";

type FakeState = {
  user: User | null;
  organizations: Record<string, Record<string, unknown>>;
  memberships: Record<string, Record<string, unknown>>;
  workshops: Record<string, Record<string, unknown>>;
  operations: { table: TableName; operation: string; payload: unknown }[];
};

describe("supabaseWorkshopStore", () => {
  it("only enables Supabase workshop storage when real env values exist", () => {
    expect(
      isConfiguredSupabaseWorkshopStore({
        VITE_SUPABASE_URL: "https://example-project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "public-anon-key",
      }),
    ).toBe(false);
    expect(
      isConfiguredSupabaseWorkshopStore({
        VITE_SUPABASE_URL: "https://real-project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "real-anon-key",
      }),
    ).toBe(true);
  });

  it("bootstraps an owner organization and saves workshop records", async () => {
    const fake = createFakeSupabase();
    const store = createSupabaseWorkshopRecordStore({
      supabase: fake.client,
      now: () => "2026-07-06T20:00:00.000Z",
    });
    const session = submitHumanMessage(
      createInitialWorkshopSession(
        "2026-07-06T19:58:00.000Z",
        "workshop-local-key",
      ),
      "Vi behöver bygga en kravworkshop för SOS Alarm.",
      "2026-07-06T19:59:00.000Z",
    );
    const record = createWorkshopRecord(session, {
      "agent-quality": ["artifact-1"],
    });

    await store.saveRecord(record);

    expect(fake.state.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "profiles", operation: "upsert" }),
        expect.objectContaining({
          table: "organizations",
          operation: "insert",
        }),
        expect.objectContaining({ table: "memberships", operation: "insert" }),
        expect.objectContaining({ table: "workshops", operation: "upsert" }),
      ]),
    );
    expect(Object.values(fake.state.workshops)[0]).toMatchObject({
      record_key: "workshop-local-key",
      title: record.title,
      status: "active",
      created_by: "user-1",
    });
  });

  it("lists and loads server-backed workshop snapshots", async () => {
    const fake = createFakeSupabase();
    const store = createSupabaseWorkshopRecordStore({ supabase: fake.client });
    const session = submitHumanMessage(
      createInitialWorkshopSession(
        "2026-07-06T19:58:00.000Z",
        "workshop-server-key",
      ),
      "Skapa en dashboard för kunders larm.",
      "2026-07-06T19:59:00.000Z",
    );
    const record = createWorkshopRecord(session);

    await store.saveRecord(record);

    await expect(store.listSummaries()).resolves.toEqual([
      expect.objectContaining({
        id: "workshop-server-key",
        messageCount: record.session.messages.length,
      }),
    ]);
    await expect(
      store.loadRecord("workshop-server-key"),
    ).resolves.toMatchObject({
      id: "workshop-server-key",
      session: expect.objectContaining({
        id: "workshop-server-key",
        messages: expect.arrayContaining([
          expect.objectContaining({
            body: "Skapa en dashboard för kunders larm.",
          }),
        ]),
      }),
    });
  });
});

function createFakeSupabase() {
  const state: FakeState = {
    user: {
      id: "user-1",
      email: "owner@example.com",
      user_metadata: { display_name: "Workshop Owner" },
    } as unknown as User,
    organizations: {},
    memberships: {},
    workshops: {},
    operations: [],
  };
  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })),
    },
    from: vi.fn((table: TableName) => new FakeQuery(table, state)),
  } as unknown as SupabaseClient;

  return { client, state };
}

class FakeQuery {
  private filters: { column: string; value: unknown }[] = [];
  private limitCount: number | null = null;
  private operation: "select" | "insert" | "upsert" = "select";
  private payload: Record<string, unknown> | null = null;
  private readonly table: TableName;
  private readonly state: FakeState;

  constructor(table: TableName, state: FakeState) {
    this.table = table;
    this.state = state;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  order() {
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  insert(payload: Record<string, unknown>) {
    this.operation = "insert";
    this.payload = payload;
    this.state.operations.push({
      table: this.table,
      operation: "insert",
      payload,
    });
    return this;
  }

  upsert(payload: Record<string, unknown>) {
    this.operation = "upsert";
    this.payload = payload;
    this.state.operations.push({
      table: this.table,
      operation: "upsert",
      payload,
    });
    return this;
  }

  single() {
    const result = this.resolve();
    return Promise.resolve({
      data: Array.isArray(result.data) ? result.data[0] : result.data,
      error: result.error,
    });
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }

  private resolve(): QueryResult {
    if (this.operation === "insert") {
      return this.applyInsert();
    }
    if (this.operation === "upsert") {
      return this.applyUpsert();
    }

    return { data: this.selectRows(), error: null };
  }

  private applyInsert(): QueryResult {
    if (!this.payload) {
      return { data: null, error: { message: "Missing payload." } };
    }

    if (this.table === "organizations") {
      const id = "org-1";
      this.state.organizations[id] = { id, ...this.payload };
      return { data: [{ id }], error: null };
    }

    if (this.table === "memberships") {
      const id = `membership-${Object.keys(this.state.memberships).length + 1}`;
      this.state.memberships[id] = { id, ...this.payload };
      return { data: [{ id }], error: null };
    }

    return { data: null, error: null };
  }

  private applyUpsert(): QueryResult {
    if (!this.payload) {
      return { data: null, error: { message: "Missing payload." } };
    }

    if (this.table === "profiles") {
      this.state.operations.push({
        table: "profiles",
        operation: "profile-upserted",
        payload: this.payload,
      });
      return { data: [this.payload], error: null };
    }

    if (this.table === "workshops") {
      const recordKey = String(this.payload.record_key);
      this.state.workshops[recordKey] = {
        id: "workshop-row-1",
        created_at: "2026-07-06T19:58:00.000Z",
        ...this.payload,
      };
      return { data: [{ id: "workshop-row-1" }], error: null };
    }

    return { data: [this.payload], error: null };
  }

  private selectRows() {
    let rows =
      this.table === "memberships"
        ? Object.values(this.state.memberships)
        : this.table === "workshops"
          ? Object.values(this.state.workshops)
          : [];

    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }

    return this.limitCount === null ? rows : rows.slice(0, this.limitCount);
  }
}

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};
