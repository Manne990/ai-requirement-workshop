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
  organization_id?: string | null;
  record_key?: string | null;
  title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  session_snapshot?: unknown;
  seen_insight_ids_by_participant?: unknown;
};

type OrganizationRole = "owner" | "facilitator" | "participant" | "viewer";

type MembershipRow = {
  organization_id?: string | null;
  role?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type OrganizationAccess = {
  id: string;
  role: OrganizationRole;
  user: User;
};

const writableOrganizationRoles = new Set<OrganizationRole>([
  "owner",
  "facilitator",
]);

export function createSupabaseWorkshopRecordStore({
  env = import.meta.env,
  supabase,
  now = () => new Date().toISOString(),
}: SupabaseWorkshopStoreOptions = {}): WorkshopRecordStore {
  const clientLoader = createSupabaseClientLoader(env, supabase);
  let organizationAccessPromise: Promise<OrganizationAccess> | null = null;

  const organizationAccess = async () => {
    organizationAccessPromise ??= ensureOrganizationAccess(
      await clientLoader(),
      env,
      now,
    );
    return organizationAccessPromise;
  };

  return {
    async listSummaries() {
      try {
        const client = await clientLoader();
        const { id: orgId } = await organizationAccess();
        const { data, error } = await client
          .from("workshops")
          .select(
            "id, organization_id, record_key, title, created_at, updated_at, session_snapshot, seen_insight_ids_by_participant",
          )
          .eq("organization_id", orgId)
          .order("updated_at", { ascending: false });

        if (error) {
          throwSupabaseError(error);
        }

        return (data ?? []).map(rowToWorkshopRecord).map(toWorkshopSummary);
      } catch (error) {
        throwOperationError("Unable to list Supabase workshops", error);
      }
    },

    async loadRecord(id) {
      try {
        const client = await clientLoader();
        const { id: orgId } = await organizationAccess();
        const { data, error } = await client
          .from("workshops")
          .select(
            "id, organization_id, record_key, title, created_at, updated_at, session_snapshot, seen_insight_ids_by_participant",
          )
          .eq("organization_id", orgId)
          .eq("record_key", id)
          .limit(1);

        if (error) {
          throwSupabaseError(error);
        }

        const row = data?.[0];
        return row ? rowToWorkshopRecord(row) : null;
      } catch (error) {
        throwOperationError(`Unable to load Supabase workshop "${id}"`, error);
      }
    },

    async saveRecord(record) {
      try {
        const client = await clientLoader();
        const access = await organizationAccess();
        assertCanWriteWorkshops(access);

        const { error } = await client
          .from("workshops")
          .upsert(
            {
              organization_id: access.id,
              record_key: record.id,
              local_import_id: record.id,
              title: record.title,
              status: "active",
              created_by: access.user.id,
              updated_at: record.updatedAt,
              session_snapshot: record.session,
              seen_insight_ids_by_participant:
                record.seenInsightIdsByParticipant,
            },
            { onConflict: "organization_id,record_key" },
          )
          .select("id");

        if (error) {
          throwSupabaseError(error);
        }
      } catch (error) {
        throwOperationError(
          `Unable to save Supabase workshop "${record.id}"`,
          error,
        );
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

async function ensureOrganizationAccess(
  client: SupabaseClient,
  env: BrowserEnv,
  now: () => string,
): Promise<OrganizationAccess> {
  const user = await requireCurrentUser(client);
  await ensureProfile(client, user);

  const configuredOrgId = env.VITE_SUPABASE_ORGANIZATION_ID?.trim();
  const memberships = await loadActiveMemberships(client, user.id);

  if (configuredOrgId) {
    const membership = memberships.find(
      (candidate) => candidate.organization_id === configuredOrgId,
    );
    if (!membership) {
      throw new Error(
        `Current user is not an active member of configured Supabase organization "${configuredOrgId}". Ask an organization owner to add this user, or remove VITE_SUPABASE_ORGANIZATION_ID to let the app create a personal organization.`,
      );
    }

    return {
      id: configuredOrgId,
      role: membership.role,
      user,
    };
  }

  const existingMembership = chooseMembership(memberships);
  if (existingMembership) {
    return {
      id: existingMembership.organization_id,
      role: existingMembership.role,
      user,
    };
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
    throwSupabaseError(createOrgError);
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
    throwSupabaseError(membershipInsertError);
  }

  return {
    id: orgId,
    role: "owner",
    user,
  };
}

async function loadActiveMemberships(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("memberships")
    .select("organization_id, role, status, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throwSupabaseError(error);
  }

  return Array.isArray(data)
    ? data.flatMap((row) => normalizeMembership(row))
    : [];
}

function normalizeMembership(row: MembershipRow) {
  if (
    typeof row.organization_id !== "string" ||
    !row.organization_id ||
    !isOrganizationRole(row.role) ||
    row.status !== "active"
  ) {
    return [];
  }

  return [
    {
      organization_id: row.organization_id,
      role: row.role,
      created_at: stringOr(row.created_at),
    },
  ];
}

function chooseMembership(
  memberships: ReturnType<typeof normalizeMembership>[number][],
) {
  return [...memberships].sort(compareMemberships)[0] ?? null;
}

function compareMemberships(
  left: ReturnType<typeof normalizeMembership>[number],
  right: ReturnType<typeof normalizeMembership>[number],
) {
  return (
    rolePriority(left.role) - rolePriority(right.role) ||
    left.created_at.localeCompare(right.created_at) ||
    left.organization_id.localeCompare(right.organization_id)
  );
}

function rolePriority(role: OrganizationRole) {
  return writableOrganizationRoles.has(role) ? 0 : 1;
}

function assertCanWriteWorkshops(access: OrganizationAccess) {
  if (writableOrganizationRoles.has(access.role)) {
    return;
  }

  throw new Error(
    `Current user has "${access.role}" access to organization "${access.id}", but saving workshop records requires owner or facilitator access.`,
  );
}

function isOrganizationRole(value: unknown): value is OrganizationRole {
  return (
    value === "owner" ||
    value === "facilitator" ||
    value === "participant" ||
    value === "viewer"
  );
}

async function ensureProfile(client: SupabaseClient, user: User) {
  const { error } = await client.from("profiles").upsert({
    id: user.id,
    email: user.email ?? "",
    display_name: displayNameForUser(user),
  });

  if (error) {
    throwSupabaseError(error);
  }
}

async function requireCurrentUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error) {
    throwSupabaseError(error);
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
    organizationId: stringOr(row.organization_id) || undefined,
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

function throwSupabaseError(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}): never {
  const parts = [error.message || "Supabase request failed."];
  if (error.code) {
    parts.push(`Code: ${error.code}.`);
  }
  if (error.details) {
    parts.push(`Details: ${error.details}`);
  }
  if (error.hint) {
    parts.push(`Hint: ${error.hint}`);
  }

  throw new Error(parts.join(" "));
}

function throwOperationError(operation: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith(`${operation}:`)) {
    throw error;
  }

  throw new Error(`${operation}: ${message}`);
}
