export type OrganizationStatus = "active" | "archived";

export type OrganizationRole =
  "owner" | "admin" | "facilitator" | "member" | "viewer";

export type OrganizationMembershipStatus = "active" | "suspended" | "removed";

export type OrganizationInviteStatus =
  "pending" | "accepted" | "revoked" | "expired";

export type OrganizationPermission =
  | "view-workshop"
  | "comment-workshop"
  | "create-workshop"
  | "edit-workshop"
  | "facilitate-workshop"
  | "invite-members"
  | "manage-members"
  | "manage-organization";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationMembership = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: OrganizationMembershipStatus;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationInvite = {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  status: OrganizationInviteStatus;
  invitedByUserId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  acceptedByUserId?: string;
  acceptedAt?: string;
  revokedByUserId?: string;
  revokedAt?: string;
};

export type OrganizationState = {
  organizations: Organization[];
  memberships: OrganizationMembership[];
  invites: OrganizationInvite[];
};

export type CreateOrganizationDraft = {
  id?: string;
  name: string;
  slug?: string;
  ownerUserId: string;
  ownerMembershipId?: string;
};

export type CreateOrganizationInviteDraft = {
  id?: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  invitedByUserId: string;
  expiresAt?: string;
};

export type AcceptOrganizationInviteDraft = {
  inviteId: string;
  userId: string;
  email: string;
};

export type UpdateOrganizationMembershipRoleDraft = {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  updatedByUserId: string;
};

export type UpdateOrganizationMembershipStatusDraft = {
  organizationId: string;
  userId: string;
  status: OrganizationMembershipStatus;
  updatedByUserId: string;
};

export type OrganizationScopedWorkshop = {
  id: string;
  organizationId: string;
};

export type OrganizationAccessReason =
  | "allowed"
  | "organization-missing"
  | "organization-archived"
  | "user-missing"
  | "membership-missing"
  | "membership-inactive"
  | "role-lacks-permission";

export type OrganizationAccessDecision = {
  allowed: boolean;
  reason: OrganizationAccessReason;
  role?: OrganizationRole;
  membershipId?: string;
};

export const emptyOrganizationState: OrganizationState = {
  organizations: [],
  memberships: [],
  invites: [],
};

export const organizationRoles: OrganizationRole[] = [
  "owner",
  "admin",
  "facilitator",
  "member",
  "viewer",
];

export const organizationPermissionsByRole: Record<
  OrganizationRole,
  OrganizationPermission[]
> = {
  owner: [
    "view-workshop",
    "comment-workshop",
    "create-workshop",
    "edit-workshop",
    "facilitate-workshop",
    "invite-members",
    "manage-members",
    "manage-organization",
  ],
  admin: [
    "view-workshop",
    "comment-workshop",
    "create-workshop",
    "edit-workshop",
    "facilitate-workshop",
    "invite-members",
    "manage-members",
  ],
  facilitator: [
    "view-workshop",
    "comment-workshop",
    "create-workshop",
    "edit-workshop",
    "facilitate-workshop",
  ],
  member: ["view-workshop", "comment-workshop", "create-workshop"],
  viewer: ["view-workshop"],
};

const grantableRolesByRole: Record<OrganizationRole, OrganizationRole[]> = {
  owner: organizationRoles,
  admin: ["facilitator", "member", "viewer"],
  facilitator: [],
  member: [],
  viewer: [],
};

const roleRank: Record<OrganizationRole, number> = {
  viewer: 1,
  member: 2,
  facilitator: 3,
  admin: 4,
  owner: 5,
};

const now = () => new Date().toISOString();

export function createOrganization(
  state: OrganizationState,
  draft: CreateOrganizationDraft,
  createdAt = now(),
): OrganizationState {
  const name = readRequiredText(draft.name, "Organization name");
  const ownerUserId = readRequiredText(draft.ownerUserId, "Owner user id");
  const slug = uniqueOrganizationSlug(
    normalizeSlug(draft.slug ?? name),
    state.organizations,
  );
  const organization: Organization = {
    id: draft.id ?? createId("organization", state.organizations.length + 1),
    name,
    slug,
    status: "active",
    createdByUserId: ownerUserId,
    createdAt,
    updatedAt: createdAt,
  };
  const membership: OrganizationMembership = {
    id:
      draft.ownerMembershipId ??
      createId("membership", state.memberships.length + 1),
    organizationId: organization.id,
    userId: ownerUserId,
    role: "owner",
    status: "active",
    createdAt,
    updatedAt: createdAt,
  };

  return {
    ...state,
    organizations: [...state.organizations, organization],
    memberships: [...state.memberships, membership],
  };
}

export function inviteOrganizationMember(
  state: OrganizationState,
  draft: CreateOrganizationInviteDraft,
  createdAt = now(),
): OrganizationState {
  assertOrganizationExists(state, draft.organizationId);
  assertCanGrantRole(
    state,
    draft.invitedByUserId,
    draft.organizationId,
    draft.role,
    "invite-members",
  );

  const email = normalizeEmail(draft.email);
  const existingInvite = state.invites.find(
    (invite) =>
      invite.organizationId === draft.organizationId &&
      invite.email === email &&
      invite.status === "pending",
  );
  const expiresAt = draft.expiresAt ?? addUtcDays(createdAt, 14);

  if (existingInvite) {
    return {
      ...state,
      invites: state.invites.map((invite) =>
        invite.id === existingInvite.id
          ? {
              ...invite,
              role: draft.role,
              invitedByUserId: draft.invitedByUserId,
              expiresAt,
              updatedAt: createdAt,
            }
          : invite,
      ),
    };
  }

  const invite: OrganizationInvite = {
    id: draft.id ?? createId("invite", state.invites.length + 1),
    organizationId: draft.organizationId,
    email,
    role: draft.role,
    status: "pending",
    invitedByUserId: draft.invitedByUserId,
    expiresAt,
    createdAt,
    updatedAt: createdAt,
  };

  return {
    ...state,
    invites: [...state.invites, invite],
  };
}

export function acceptOrganizationInvite(
  state: OrganizationState,
  draft: AcceptOrganizationInviteDraft,
  acceptedAt = now(),
): OrganizationState {
  const invite = state.invites.find((item) => item.id === draft.inviteId);

  if (!invite) {
    throw new Error("Organization invite not found.");
  }

  if (invite.status !== "pending") {
    throw new Error("Organization invite is not pending.");
  }

  if (isInviteExpired(invite, acceptedAt)) {
    throw new Error("Organization invite has expired.");
  }

  const email = normalizeEmail(draft.email);
  if (invite.email !== email) {
    throw new Error("Organization invite email does not match.");
  }

  const existingMembership = state.memberships.find(
    (membership) =>
      membership.organizationId === invite.organizationId &&
      membership.userId === draft.userId,
  );
  const acceptedInvite: OrganizationInvite = {
    ...invite,
    status: "accepted",
    acceptedByUserId: draft.userId,
    acceptedAt,
    updatedAt: acceptedAt,
  };

  if (existingMembership) {
    return {
      ...state,
      memberships: state.memberships.map((membership) =>
        membership.id === existingMembership.id
          ? {
              ...membership,
              role: higherRole(membership.role, invite.role),
              status: "active",
              updatedAt: acceptedAt,
            }
          : membership,
      ),
      invites: replaceInvite(state.invites, acceptedInvite),
    };
  }

  const membership: OrganizationMembership = {
    id: createId("membership", state.memberships.length + 1),
    organizationId: invite.organizationId,
    userId: readRequiredText(draft.userId, "User id"),
    role: invite.role,
    status: "active",
    createdAt: acceptedAt,
    updatedAt: acceptedAt,
  };

  return {
    ...state,
    memberships: [...state.memberships, membership],
    invites: replaceInvite(state.invites, acceptedInvite),
  };
}

export function revokeOrganizationInvite(
  state: OrganizationState,
  inviteId: string,
  revokedByUserId: string,
  revokedAt = now(),
): OrganizationState {
  const invite = state.invites.find((item) => item.id === inviteId);

  if (!invite) {
    throw new Error("Organization invite not found.");
  }

  assertCanGrantRole(
    state,
    revokedByUserId,
    invite.organizationId,
    invite.role,
    "invite-members",
  );

  if (invite.status !== "pending") {
    return state;
  }

  return {
    ...state,
    invites: state.invites.map((item) =>
      item.id === invite.id
        ? {
            ...item,
            status: "revoked",
            revokedByUserId,
            revokedAt,
            updatedAt: revokedAt,
          }
        : item,
    ),
  };
}

export function expireOrganizationInvites(
  state: OrganizationState,
  asOf = now(),
): OrganizationState {
  return {
    ...state,
    invites: state.invites.map((invite) =>
      invite.status === "pending" && isInviteExpired(invite, asOf)
        ? { ...invite, status: "expired", updatedAt: asOf }
        : invite,
    ),
  };
}

export function updateOrganizationMembershipRole(
  state: OrganizationState,
  draft: UpdateOrganizationMembershipRoleDraft,
  updatedAt = now(),
): OrganizationState {
  const membership = findMembership(state, draft.organizationId, draft.userId);

  if (!membership) {
    throw new Error("Organization membership not found.");
  }

  const actorRole = assertCanManageMembership(
    state,
    draft.updatedByUserId,
    membership,
    "manage-members",
  );
  assertCanGrantRoleValue(actorRole, draft.role);
  assertDoesNotRemoveLastOwner(
    state,
    membership,
    draft.role,
    membership.status,
  );

  return {
    ...state,
    memberships: state.memberships.map((item) =>
      item.id === membership.id
        ? { ...item, role: draft.role, updatedAt }
        : item,
    ),
  };
}

export function updateOrganizationMembershipStatus(
  state: OrganizationState,
  draft: UpdateOrganizationMembershipStatusDraft,
  updatedAt = now(),
): OrganizationState {
  const membership = findMembership(state, draft.organizationId, draft.userId);

  if (!membership) {
    throw new Error("Organization membership not found.");
  }

  assertCanManageMembership(
    state,
    draft.updatedByUserId,
    membership,
    "manage-members",
  );
  assertDoesNotRemoveLastOwner(
    state,
    membership,
    membership.role,
    draft.status,
  );

  return {
    ...state,
    memberships: state.memberships.map((item) =>
      item.id === membership.id
        ? { ...item, status: draft.status, updatedAt }
        : item,
    ),
  };
}

export function checkOrganizationAccess(
  state: OrganizationState,
  userId: string,
  organizationId: string,
  permission: OrganizationPermission,
): OrganizationAccessDecision {
  const organization = state.organizations.find(
    (item) => item.id === organizationId,
  );

  if (!organization) {
    return deny("organization-missing");
  }

  if (organization.status !== "active") {
    return deny("organization-archived");
  }

  if (!userId.trim()) {
    return deny("user-missing");
  }

  const membership = findMembership(state, organizationId, userId);
  if (!membership) {
    return deny("membership-missing");
  }

  if (membership.status !== "active") {
    return deny("membership-inactive", membership);
  }

  if (!roleHasPermission(membership.role, permission)) {
    return deny("role-lacks-permission", membership);
  }

  return {
    allowed: true,
    reason: "allowed",
    role: membership.role,
    membershipId: membership.id,
  };
}

export function canAccessOrganization(
  state: OrganizationState,
  userId: string,
  organizationId: string,
  permission: OrganizationPermission,
): boolean {
  return checkOrganizationAccess(state, userId, organizationId, permission)
    .allowed;
}

export function checkWorkshopAccess(
  state: OrganizationState,
  userId: string,
  workshop: OrganizationScopedWorkshop,
  permission: OrganizationPermission,
): OrganizationAccessDecision {
  return checkOrganizationAccess(
    state,
    userId,
    workshop.organizationId,
    permission,
  );
}

export function canAccessWorkshop(
  state: OrganizationState,
  userId: string,
  workshop: OrganizationScopedWorkshop,
  permission: OrganizationPermission,
): boolean {
  return checkWorkshopAccess(state, userId, workshop, permission).allowed;
}

export function getActiveMembership(
  state: OrganizationState,
  organizationId: string,
  userId: string,
): OrganizationMembership | undefined {
  const membership = findMembership(state, organizationId, userId);
  return membership?.status === "active" ? membership : undefined;
}

export function roleHasPermission(
  role: OrganizationRole,
  permission: OrganizationPermission,
): boolean {
  return organizationPermissionsByRole[role].includes(permission);
}

function assertCanGrantRole(
  state: OrganizationState,
  userId: string,
  organizationId: string,
  role: OrganizationRole,
  permission: OrganizationPermission,
) {
  const decision = checkOrganizationAccess(
    state,
    userId,
    organizationId,
    permission,
  );

  if (!decision.allowed) {
    throw new Error("User cannot manage organization members.");
  }

  assertCanGrantRoleValue(decision.role, role);
}

function assertCanManageMembership(
  state: OrganizationState,
  userId: string,
  membership: OrganizationMembership,
  permission: OrganizationPermission,
): OrganizationRole {
  const decision = checkOrganizationAccess(
    state,
    userId,
    membership.organizationId,
    permission,
  );

  if (!decision.allowed) {
    throw new Error("User lacks organization permission.");
  }

  if (
    !decision.role ||
    (decision.role !== "owner" &&
      roleRank[membership.role] >= roleRank[decision.role])
  ) {
    throw new Error("User cannot manage that organization membership.");
  }

  return decision.role;
}

function assertCanGrantRoleValue(
  actorRole: OrganizationRole | undefined,
  targetRole: OrganizationRole,
) {
  if (!actorRole || !grantableRolesByRole[actorRole].includes(targetRole)) {
    throw new Error("User cannot grant that organization role.");
  }
}

function assertOrganizationExists(
  state: OrganizationState,
  organizationId: string,
) {
  if (!state.organizations.some((item) => item.id === organizationId)) {
    throw new Error("Organization not found.");
  }
}

function assertDoesNotRemoveLastOwner(
  state: OrganizationState,
  membership: OrganizationMembership,
  nextRole: OrganizationRole,
  nextStatus: OrganizationMembershipStatus,
) {
  const keepsOwner =
    membership.role === "owner" &&
    nextRole === "owner" &&
    nextStatus === "active";

  if (membership.role !== "owner" || keepsOwner) {
    return;
  }

  const activeOwners = state.memberships.filter(
    (item) =>
      item.organizationId === membership.organizationId &&
      item.role === "owner" &&
      item.status === "active",
  );

  if (activeOwners.length <= 1) {
    throw new Error("Organization must keep at least one active owner.");
  }
}

function findMembership(
  state: OrganizationState,
  organizationId: string,
  userId: string,
) {
  return state.memberships.find(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.userId === userId,
  );
}

function replaceInvite(
  invites: OrganizationInvite[],
  replacement: OrganizationInvite,
) {
  return invites.map((invite) =>
    invite.id === replacement.id ? replacement : invite,
  );
}

function higherRole(
  currentRole: OrganizationRole,
  invitedRole: OrganizationRole,
) {
  return roleRank[currentRole] >= roleRank[invitedRole]
    ? currentRole
    : invitedRole;
}

function deny(
  reason: OrganizationAccessReason,
  membership?: OrganizationMembership,
): OrganizationAccessDecision {
  return {
    allowed: false,
    reason,
    role: membership?.role,
    membershipId: membership?.id,
  };
}

function isInviteExpired(invite: OrganizationInvite, asOf: string) {
  return Date.parse(invite.expiresAt) <= Date.parse(asOf);
}

function addUtcDays(isoDate: string, days: number) {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function uniqueOrganizationSlug(slug: string, organizations: Organization[]) {
  const existingSlugs = new Set(
    organizations.map((organization) => organization.slug),
  );

  if (!existingSlugs.has(slug)) {
    return slug;
  }

  let index = 2;
  while (existingSlugs.has(`${slug}-${index}`)) {
    index += 1;
  }
  return `${slug}-${index}`;
}

function normalizeSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "organization";
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Invite email is invalid.");
  }
  return email;
}

function readRequiredText(value: string, label: string) {
  const text = value.trim();
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
}

function createId(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(3, "0")}`;
}
