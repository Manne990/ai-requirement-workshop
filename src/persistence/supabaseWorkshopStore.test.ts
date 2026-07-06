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
type QueryOperation = "select" | "insert" | "upsert";
type QueryError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

type FakeState = {
  user: User | null;
  organizations: Record<string, Record<string, unknown>>;
  memberships: Record<string, Record<string, unknown>>;
  workshops: Record<string, Record<string, unknown>>;
  operations: { table: TableName; operation: string; payload: unknown }[];
  queryErrors: Partial<
    Record<TableName, Partial<Record<QueryOperation, QueryError>>>
  >;
};

type FakeSupabaseOptions = {
  user?: User | null;
  memberships?: Record<string, unknown>[];
  queryErrors?: FakeState["queryErrors"];
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
    const record = createTestRecord("workshop-local-key", {
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

  it("uses a configured organization id when the user is already a member", async () => {
    const fake = createFakeSupabase({
      memberships: [
        createMembership({
          organization_id: "org-configured",
          role: "owner",
          created_at: "2026-07-06T19:00:00.000Z",
        }),
      ],
    });
    const store = createSupabaseWorkshopRecordStore({
      env: { VITE_SUPABASE_ORGANIZATION_ID: " org-configured " },
      supabase: fake.client,
    });
    const record = createTestRecord("configured-workshop");

    await store.saveRecord(record);

    expect(fake.state.operations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "organizations",
          operation: "insert",
        }),
        expect.objectContaining({ table: "memberships", operation: "insert" }),
      ]),
    );
    expect(fake.state.workshops["configured-workshop"]).toMatchObject({
      organization_id: "org-configured",
      record_key: "configured-workshop",
    });
  });

  it("reuses an existing writable membership before creating an organization", async () => {
    const fake = createFakeSupabase({
      memberships: [
        createMembership({
          organization_id: "org-viewer",
          role: "viewer",
          created_at: "2026-07-06T18:00:00.000Z",
        }),
        createMembership({
          organization_id: "org-facilitator",
          role: "facilitator",
          created_at: "2026-07-06T19:00:00.000Z",
        }),
      ],
    });
    const store = createSupabaseWorkshopRecordStore({ supabase: fake.client });
    const record = createTestRecord("existing-membership-workshop");

    await store.saveRecord(record);

    expect(fake.state.operations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "organizations",
          operation: "insert",
        }),
      ]),
    );
    expect(fake.state.workshops["existing-membership-workshop"]).toMatchObject({
      organization_id: "org-facilitator",
      record_key: "existing-membership-workshop",
    });
  });

  it("explains when a configured organization does not include the user", async () => {
    const fake = createFakeSupabase({
      memberships: [
        createMembership({
          organization_id: "org-other",
          role: "owner",
          created_at: "2026-07-06T19:00:00.000Z",
        }),
      ],
    });
    const store = createSupabaseWorkshopRecordStore({
      env: { VITE_SUPABASE_ORGANIZATION_ID: "org-configured" },
      supabase: fake.client,
    });

    await expect(
      store.saveRecord(createTestRecord("missing-configured-org")),
    ).rejects.toThrow(
      'Unable to save Supabase workshop "missing-configured-org": Current user is not an active member of configured Supabase organization "org-configured".',
    );
  });

  it("lists and loads server-backed workshop snapshots", async () => {
    const fake = createFakeSupabase();
    const store = createSupabaseWorkshopRecordStore({ supabase: fake.client });
    const record = createTestRecord(
      "workshop-server-key",
      {},
      "Skapa en dashboard för kunders larm.",
    );

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

  it("adds operation context to Supabase list, load, and save errors", async () => {
    const listStore = createSupabaseWorkshopRecordStore({
      supabase: createFakeSupabase({
        queryErrors: {
          workshops: {
            select: {
              message: "permission denied for table workshops",
              code: "42501",
            },
          },
        },
      }).client,
    });
    await expect(listStore.listSummaries()).rejects.toThrow(
      "Unable to list Supabase workshops: permission denied for table workshops Code: 42501.",
    );

    const loadStore = createSupabaseWorkshopRecordStore({
      supabase: createFakeSupabase({
        queryErrors: {
          workshops: {
            select: { message: "network request failed" },
          },
        },
      }).client,
    });
    await expect(loadStore.loadRecord("workshop-missing")).rejects.toThrow(
      'Unable to load Supabase workshop "workshop-missing": network request failed',
    );

    const saveStore = createSupabaseWorkshopRecordStore({
      supabase: createFakeSupabase({
        queryErrors: {
          workshops: {
            upsert: { message: "new row violates row-level security policy" },
          },
        },
      }).client,
    });
    await expect(
      saveStore.saveRecord(createTestRecord("workshop-save-error")),
    ).rejects.toThrow(
      'Unable to save Supabase workshop "workshop-save-error": new row violates row-level security policy',
    );
  });
});

function createTestRecord(
  id: string,
  seenInsightIdsByParticipant = {},
  body = "Vi behöver bygga en kravworkshop för SOS Alarm.",
) {
  const session = submitHumanMessage(
    createInitialWorkshopSession("2026-07-06T19:58:00.000Z", id),
    body,
    "2026-07-06T19:59:00.000Z",
  );
  return createWorkshopRecord(session, seenInsightIdsByParticipant);
}

function createMembership(
  overrides: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    organization_id: "org-1",
    user_id: "user-1",
    role: "owner",
    status: "active",
    created_at: "2026-07-06T18:00:00.000Z",
    ...overrides,
  };
}

function createFakeSupabase(options: FakeSupabaseOptions = {}) {
  const state: FakeState = {
    user:
      options.user === undefined
        ? ({
            id: "user-1",
            email: "owner@example.com",
            user_metadata: { display_name: "Workshop Owner" },
          } as unknown as User)
        : options.user,
    organizations: {},
    memberships: Object.fromEntries(
      (options.memberships ?? []).map((membership, index) => [
        `membership-${index + 1}`,
        { id: `membership-${index + 1}`, ...membership },
      ]),
    ),
    workshops: {},
    operations: [],
    queryErrors: options.queryErrors ?? {},
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
  private orders: { column: string; ascending: boolean }[] = [];
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

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending ?? true });
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
    const queryError = this.state.queryErrors[this.table]?.[this.operation];
    if (queryError) {
      return { data: null, error: queryError };
    }

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
      return { data: [this.payload], error: null };
    }

    if (this.table === "workshops") {
      const recordKey = String(this.payload.record_key);
      const existing = this.state.workshops[recordKey];
      const rowId =
        typeof existing?.id === "string"
          ? existing.id
          : `workshop-row-${Object.keys(this.state.workshops).length + 1}`;
      this.state.workshops[recordKey] = {
        id: rowId,
        created_at: existing?.created_at ?? "2026-07-06T19:58:00.000Z",
        ...this.payload,
      };
      return { data: [{ id: rowId }], error: null };
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

    for (const order of [...this.orders].reverse()) {
      rows = [...rows].sort((left, right) => {
        const leftValue = String(left[order.column] ?? "");
        const rightValue = String(right[order.column] ?? "");
        return order.ascending
          ? leftValue.localeCompare(rightValue)
          : rightValue.localeCompare(leftValue);
      });
    }

    return this.limitCount === null ? rows : rows.slice(0, this.limitCount);
  }
}

type QueryResult = {
  data: unknown;
  error: QueryError | null;
};
