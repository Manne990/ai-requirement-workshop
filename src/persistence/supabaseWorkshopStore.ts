import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { WorkshopRecordStore } from "./workshopRepository";
import {
  toWorkshopSummary,
  type SeenInsightIdsByParticipant,
  type WorkshopRecord,
} from "./workshopStore";
import type { WorkshopSession } from "../domain/workshop";

type BrowserEnv = Record<string, string | undefined>;

type SupabaseWorkshopStoreOptions = {
  env?: BrowserEnv;
  supabase?: SupabaseClient;
  now?: () => string;
};

type WorkshopRow = {
  id?: string;
  record_key?: string | null;
  title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  session_snapshot?: unknown;
  seen_insight_ids_by_participant?: unknown;
};

export function createSupabaseWorkshopRecordStore({
  env = import.meta.env,
  supabase,
  now = () => new Date().toISOString(),
}: SupabaseWorkshopStoreOptions = {}): WorkshopRecordStore {
  const clientLoader = createSupabaseClientLoader(env, supabase);
  let organizationIdPromise: Promise<string> | null = null;

  const organizationId = async () => {
    organizationIdPromise ??= ensureWritableOrganization(
      await clientLoader(),
      env,
      now,
    );
    return organizationIdPromise;
  };

  return {
    async listSummaries() {
      const client = await clientLoader();
      const orgId = await organizationId();
      const { data, error } = await client
        .from("workshops")
        .select(
          "id, record_key, title, created_at, updated_at, session_snapshot, seen_insight_ids_by_participant",
        )
        .eq("organization_id", orgId)
        .order("updated_at", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map(rowToWorkshopRecord).map(toWorkshopSummary);
    },

    async loadRecord(id) {
      const client = await clientLoader();
      const orgId = await organizationId();
      const { data, error } = await client
        .from("workshops")
        .select(
          "id, record_key, title, created_at, updated_at, session_snapshot, seen_insight_ids_by_participant",
        )
        .eq("organization_id", orgId)
        .eq("record_key", id)
        .limit(1);

      if (error) {
        throw new Error(error.message);
      }

      const row = data?.[0];
      return row ? rowToWorkshopRecord(row) : null;
    },

    async saveRecord(record) {
      const client = await clientLoader();
      const orgId = await organizationId();
      const user = await requireCurrentUser(client);

      const { error } = await client
        .from("workshops")
        .upsert(
          {
            organization_id: orgId,
            record_key: record.id,
            local_import_id: record.id,
            title: record.title,
            status: "active",
            created_by: user.id,
            updated_at: record.updatedAt,
            session_snapshot: record.session,
            seen_insight_ids_by_participant: record.seenInsightIdsByParticipant,
          },
          { onConflict: "organization_id,record_key" },
        )
        .select("id");

      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

export function isConfiguredSupabaseWorkshopStore(
  env: BrowserEnv = import.meta.env,
) {
  return isConfiguredSupabase(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_ANON_KEY,
  );
}

function createSupabaseClientLoader(
  env: BrowserEnv,
  suppliedClient?: SupabaseClient,
) {
  let clientPromise: Promise<SupabaseClient> | null = null;

  return async () => {
    if (suppliedClient) {
      return suppliedClient;
    }

    if (!isConfiguredSupabaseWorkshopStore(env)) {
      throw new Error(
        "Supabase workshop storage is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      );
    }

    clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!),
    );
    return clientPromise;
  };
}

async function ensureWritableOrganization(
  client: SupabaseClient,
  env: BrowserEnv,
  now: () => string,
) {
  const configuredOrgId = env.VITE_SUPABASE_ORGANIZATION_ID?.trim();
  if (configuredOrgId) {
    return configuredOrgId;
  }

  const user = await requireCurrentUser(client);
  await ensureProfile(client, user);

  const { data: memberships, error: membershipError } = await client
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const existingOrgId = memberships?.[0]?.organization_id;
  if (typeof existingOrgId === "string" && existingOrgId) {
    return existingOrgId;
  }

  const slug = `org-${user.id.slice(0, 8).toLowerCase()}`;
  const displayName = displayNameForUser(user);
  const { data: createdOrg, error: createOrgError } = await client
    .from("organizations")
    .insert({
      name: `${displayName}'s organization`,
      slug,
      created_by: user.id,
      updated_at: now(),
    })
    .select("id")
    .single();

  if (createOrgError) {
    throw new Error(createOrgError.message);
  }

  const orgId = createdOrg?.id;
  if (typeof orgId !== "string" || !orgId) {
    throw new Error("Supabase did not return an organization id.");
  }

  const { error: membershipInsertError } = await client
    .from("memberships")
    .insert({
      organization_id: orgId,
      user_id: user.id,
      role: "owner",
    });

  if (membershipInsertError) {
    throw new Error(membershipInsertError.message);
  }

  return orgId;
}

async function ensureProfile(client: SupabaseClient, user: User) {
  const { error } = await client.from("profiles").upsert({
    id: user.id,
    email: user.email ?? "",
    display_name: displayNameForUser(user),
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function requireCurrentUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error("Sign in before using server-backed workshop storage.");
  }

  return data.user;
}

function rowToWorkshopRecord(row: WorkshopRow): WorkshopRecord {
  const session = isWorkshopSession(row.session_snapshot)
    ? row.session_snapshot
    : null;
  const recordKey = stringOr(row.record_key, stringOr(row.id));
  if (!recordKey || !session) {
    throw new Error("Supabase returned an invalid workshop record.");
  }

  const title = stringOr(row.title, stringOr(session.title, "Workshop"));
  const updatedAt = stringOr(row.updated_at, stringOr(session.updatedAt));
  const createdAt = stringOr(row.created_at, session.messages[0]?.createdAt);

  return {
    id: recordKey,
    title,
    createdAt,
    updatedAt,
    session: {
      ...session,
      id: recordKey,
      title,
      attachments: session.attachments ?? [],
      prototypes: session.prototypes ?? [],
      updatedAt,
    },
    seenInsightIdsByParticipant: normalizeSeenInsights(
      row.seen_insight_ids_by_participant,
    ),
  };
}

function normalizeSeenInsights(value: unknown): SeenInsightIdsByParticipant {
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

function isWorkshopSession(value: unknown): value is WorkshopSession {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.participants) &&
    Array.isArray(value.messages) &&
    Array.isArray(value.artifacts) &&
    Array.isArray(value.links)
  );
}

function displayNameForUser(user: User) {
  const metadataName = user.user_metadata?.display_name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  return user.email?.split("@")[0] || user.id;
}

function isConfiguredSupabase(
  supabaseUrl: string | undefined,
  supabaseAnonKey: string | undefined,
) {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("example-project") &&
    supabaseAnonKey !== "public-anon-key",
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOr(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}
