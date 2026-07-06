import {
  acceptOrganizationInvite,
  checkOrganizationAccess,
  checkWorkshopAccess,
  createOrganization,
  emptyOrganizationState,
  expireOrganizationInvites,
  inviteOrganizationMember,
  revokeOrganizationInvite,
  updateOrganizationMembershipRole,
  updateOrganizationMembershipStatus,
  type AcceptOrganizationInviteDraft,
  type CreateOrganizationDraft,
  type CreateOrganizationInviteDraft,
  type Organization,
  type OrganizationAccessDecision,
  type OrganizationInvite,
  type OrganizationMembership,
  type OrganizationPermission,
  type OrganizationScopedWorkshop,
  type OrganizationState,
  type UpdateOrganizationMembershipRoleDraft,
  type UpdateOrganizationMembershipStatusDraft,
} from "../domain/organization";

export type OrganizationMembershipContext = {
  organization: Organization;
  membership: OrganizationMembership;
};

export type OrganizationStateStore = {
  loadState: () => Promise<OrganizationState>;
  saveState: (state: OrganizationState) => Promise<void>;
};

export type ActiveOrganizationStore = {
  getActiveOrganizationId: (userId: string) => Promise<string | null>;
  setActiveOrganizationId: (
    userId: string,
    organizationId: string,
  ) => Promise<void>;
};

export type OrganizationRepository = {
  loadState: () => Promise<OrganizationState>;
  saveState: (state: OrganizationState) => Promise<void>;
  createOrganization: (
    draft: CreateOrganizationDraft,
    createdAt?: string,
  ) => Promise<OrganizationState>;
  inviteMember: (
    draft: CreateOrganizationInviteDraft,
    createdAt?: string,
  ) => Promise<OrganizationState>;
  acceptInvite: (
    draft: AcceptOrganizationInviteDraft,
    acceptedAt?: string,
  ) => Promise<OrganizationState>;
  revokeInvite: (
    inviteId: string,
    revokedByUserId: string,
    revokedAt?: string,
  ) => Promise<OrganizationState>;
  expireInvites: (asOf?: string) => Promise<OrganizationState>;
  updateMembershipRole: (
    draft: UpdateOrganizationMembershipRoleDraft,
    updatedAt?: string,
  ) => Promise<OrganizationState>;
  updateMembershipStatus: (
    draft: UpdateOrganizationMembershipStatusDraft,
    updatedAt?: string,
  ) => Promise<OrganizationState>;
  listMembershipsForUser: (
    userId: string,
  ) => Promise<OrganizationMembershipContext[]>;
  getActiveOrganizationForUser: (
    userId: string,
  ) => Promise<OrganizationMembershipContext | null>;
  setActiveOrganizationId: (
    userId: string,
    organizationId: string,
  ) => Promise<void>;
  checkOrganizationAccess: (
    userId: string,
    organizationId: string,
    permission: OrganizationPermission,
  ) => Promise<OrganizationAccessDecision>;
  assertWorkshopAccess: (
    userId: string,
    workshop: OrganizationScopedWorkshop,
    permission: OrganizationPermission,
  ) => Promise<OrganizationAccessDecision>;
  listAccessibleWorkshops: <Workshop extends OrganizationScopedWorkshop>(
    userId: string,
    workshops: Workshop[],
    permission: OrganizationPermission,
  ) => Promise<Workshop[]>;
};

export type OrganizationRepositoryOptions = {
  stateStore: OrganizationStateStore;
  activeOrganizationStore: ActiveOrganizationStore;
};

export type LocalOrganizationStoreOptions = {
  storage?: Pick<Storage, "getItem" | "setItem">;
  stateStorageKey?: string;
  activeOrganizationStorageKey?: string;
};

export type SupabaseOrganizationRows = {
  organizations: SupabaseOrganizationRow[];
  memberships: SupabaseMembershipRow[];
  invites: SupabaseInviteRow[];
};

export type SupabaseOrganizationGateway = {
  loadRows: () => Promise<SupabaseOrganizationRows>;
  saveRows: (rows: SupabaseOrganizationRows) => Promise<void>;
};

export type SupabaseOrganizationRow = {
  id: string;
  name: string;
  slug: string;
  status: Organization["status"];
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type SupabaseMembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationMembership["role"];
  status: OrganizationMembership["status"];
  created_at: string;
  updated_at: string;
};

export type SupabaseInviteRow = {
  id: string;
  organization_id: string;
  email: string;
  token_hash: string;
  role: OrganizationInvite["role"];
  status: OrganizationInvite["status"];
  invited_by_user_id: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  accepted_by_user_id?: string | null;
  accepted_at?: string | null;
  revoked_by_user_id?: string | null;
  revoked_at?: string | null;
};

const organizationStateStorageKey =
  "ai-requirement-workshop:v1-organization-state";
const activeOrganizationStorageKey =
  "ai-requirement-workshop:v1-active-organization";

export function createOrganizationRepository({
  stateStore,
  activeOrganizationStore,
}: OrganizationRepositoryOptions): OrganizationRepository {
  async function mutate(
    update: (state: OrganizationState) => OrganizationState,
  ) {
    const nextState = update(await stateStore.loadState());
    await stateStore.saveState(nextState);
    return nextState;
  }

  async function membershipsForUser(userId: string) {
    const state = await stateStore.loadState();
    return state.memberships
      .filter((membership) => membership.userId === userId)
      .flatMap((membership) => {
        const organization = state.organizations.find(
          (candidate) => candidate.id === membership.organizationId,
        );
        return organization && organization.status === "active"
          ? [{ organization, membership }]
          : [];
      })
      .filter(({ membership }) => membership.status === "active")
      .sort(compareMembershipContexts);
  }

  return {
    loadState: () => stateStore.loadState(),
    saveState: (state) => stateStore.saveState(state),
    createOrganization: (draft, createdAt) =>
      mutate((state) => createOrganization(state, draft, createdAt)),
    inviteMember: (draft, createdAt) =>
      mutate((state) => inviteOrganizationMember(state, draft, createdAt)),
    acceptInvite: (draft, acceptedAt) =>
      mutate((state) => acceptOrganizationInvite(state, draft, acceptedAt)),
    revokeInvite: (inviteId, revokedByUserId, revokedAt) =>
      mutate((state) =>
        revokeOrganizationInvite(state, inviteId, revokedByUserId, revokedAt),
      ),
    expireInvites: (asOf) =>
      mutate((state) => expireOrganizationInvites(state, asOf)),
    updateMembershipRole: (draft, updatedAt) =>
      mutate((state) =>
        updateOrganizationMembershipRole(state, draft, updatedAt),
      ),
    updateMembershipStatus: (draft, updatedAt) =>
      mutate((state) =>
        updateOrganizationMembershipStatus(state, draft, updatedAt),
      ),
    listMembershipsForUser: membershipsForUser,
    async getActiveOrganizationForUser(userId) {
      const memberships = await membershipsForUser(userId);
      const activeOrganizationId =
        await activeOrganizationStore.getActiveOrganizationId(userId);

      return (
        memberships.find(
          ({ organization }) => organization.id === activeOrganizationId,
        ) ??
        memberships[0] ??
        null
      );
    },
    async setActiveOrganizationId(userId, organizationId) {
      const decision = await this.checkOrganizationAccess(
        userId,
        organizationId,
        "view-workshop",
      );
      if (!decision.allowed) {
        throw new Error(`Cannot select organization: ${decision.reason}.`);
      }

      await activeOrganizationStore.setActiveOrganizationId(
        userId,
        organizationId,
      );
    },
    async checkOrganizationAccess(userId, organizationId, permission) {
      return checkOrganizationAccess(
        await stateStore.loadState(),
        userId,
        organizationId,
        permission,
      );
    },
    async assertWorkshopAccess(userId, workshop, permission) {
      const decision = checkWorkshopAccess(
        await stateStore.loadState(),
        userId,
        workshop,
        permission,
      );

      if (!decision.allowed) {
        throw new Error(`Organization access denied: ${decision.reason}.`);
      }

      return decision;
    },
    async listAccessibleWorkshops(userId, workshops, permission) {
      const state = await stateStore.loadState();
      return workshops.filter(
        (workshop) =>
          checkWorkshopAccess(state, userId, workshop, permission).allowed,
      );
    },
  };
}

export function createLocalOrganizationStateStore(
  options: LocalOrganizationStoreOptions = {},
): OrganizationStateStore {
  const suppliedStorage = options.storage;
  const storageKey = options.stateStorageKey ?? organizationStateStorageKey;

  return {
    async loadState() {
      const storage = suppliedStorage ?? requireBrowserStorage();
      return parseOrganizationState(storage.getItem(storageKey));
    },
    async saveState(state) {
      const storage = suppliedStorage ?? requireBrowserStorage();
      storage.setItem(storageKey, JSON.stringify(state));
    },
  };
}

export function createLocalActiveOrganizationStore(
  options: LocalOrganizationStoreOptions = {},
): ActiveOrganizationStore {
  const suppliedStorage = options.storage;
  const storageKey =
    options.activeOrganizationStorageKey ?? activeOrganizationStorageKey;

  return {
    async getActiveOrganizationId(userId) {
      const storage = suppliedStorage ?? requireBrowserStorage();
      return loadActiveOrganizationMap(storage, storageKey)[userId] ?? null;
    },
    async setActiveOrganizationId(userId, organizationId) {
      const storage = suppliedStorage ?? requireBrowserStorage();
      storage.setItem(
        storageKey,
        JSON.stringify({
          ...loadActiveOrganizationMap(storage, storageKey),
          [userId]: organizationId,
        }),
      );
    },
  };
}

export function createSupabaseOrganizationStateStore(
  gateway: SupabaseOrganizationGateway,
): OrganizationStateStore {
  return {
    async loadState() {
      const rows = await gateway.loadRows();
      return organizationStateFromSupabaseRows(rows);
    },
    async saveState(state) {
      await gateway.saveRows(organizationStateToSupabaseRows(state));
    },
  };
}

export function organizationStateFromSupabaseRows(
  rows: SupabaseOrganizationRows,
): OrganizationState {
  return {
    organizations: rows.organizations.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      createdByUserId: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    memberships: rows.memberships.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    invites: rows.invites.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      tokenHash: row.token_hash,
      role: row.role,
      status: row.status,
      invitedByUserId: row.invited_by_user_id,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      acceptedByUserId: row.accepted_by_user_id ?? undefined,
      acceptedAt: row.accepted_at ?? undefined,
      revokedByUserId: row.revoked_by_user_id ?? undefined,
      revokedAt: row.revoked_at ?? undefined,
    })),
  };
}

export function organizationStateToSupabaseRows(
  state: OrganizationState,
): SupabaseOrganizationRows {
  return {
    organizations: state.organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      created_by: organization.createdByUserId,
      created_at: organization.createdAt,
      updated_at: organization.updatedAt,
    })),
    memberships: state.memberships.map((membership) => ({
      id: membership.id,
      organization_id: membership.organizationId,
      user_id: membership.userId,
      role: membership.role,
      status: membership.status,
      created_at: membership.createdAt,
      updated_at: membership.updatedAt,
    })),
    invites: state.invites.map((invite) => ({
      id: invite.id,
      organization_id: invite.organizationId,
      email: invite.email,
      token_hash: invite.tokenHash,
      role: invite.role,
      status: invite.status,
      invited_by_user_id: invite.invitedByUserId,
      expires_at: invite.expiresAt,
      created_at: invite.createdAt,
      updated_at: invite.updatedAt,
      accepted_by_user_id: invite.acceptedByUserId,
      accepted_at: invite.acceptedAt,
      revoked_by_user_id: invite.revokedByUserId,
      revoked_at: invite.revokedAt,
    })),
  };
}

export const localOrganizationStateStore = createLocalOrganizationStateStore();
export const localActiveOrganizationStore =
  createLocalActiveOrganizationStore();
export const organizationRepository = createOrganizationRepository({
  stateStore: localOrganizationStateStore,
  activeOrganizationStore: localActiveOrganizationStore,
});

function requireBrowserStorage(): Pick<Storage, "getItem" | "setItem"> {
  if (typeof window === "undefined") {
    throw new Error(
      "Organization local storage is only available in a browser.",
    );
  }

  return window.localStorage;
}

function parseOrganizationState(raw: string | null): OrganizationState {
  if (!raw) {
    return emptyOrganizationState;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OrganizationState>;
    return {
      organizations: Array.isArray(parsed.organizations)
        ? parsed.organizations
        : [],
      memberships: Array.isArray(parsed.memberships) ? parsed.memberships : [],
      invites: Array.isArray(parsed.invites) ? parsed.invites : [],
    };
  } catch {
    return emptyOrganizationState;
  }
}

function loadActiveOrganizationMap(
  storage: Pick<Storage, "getItem">,
  storageKey: string,
) {
  try {
    const raw = storage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function compareMembershipContexts(
  left: OrganizationMembershipContext,
  right: OrganizationMembershipContext,
) {
  return (
    left.organization.name.localeCompare(right.organization.name) ||
    left.organization.id.localeCompare(right.organization.id)
  );
}
