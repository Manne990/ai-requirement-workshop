import { describe, expect, it } from "vitest";
import {
  acceptOrganizationInvite,
  canAccessWorkshop,
  checkOrganizationAccess,
  createOrganization,
  emptyOrganizationState,
  expireOrganizationInvites,
  inviteOrganizationMember,
  revokeOrganizationInvite,
  updateOrganizationMembershipRole,
  updateOrganizationMembershipStatus,
  type OrganizationState,
} from "./organization";

const createdAt = "2026-07-06T08:00:00.000Z";

describe("organization domain", () => {
  it("creates an organization with a normalized slug and active owner membership", () => {
    const state = createOrganization(
      emptyOrganizationState,
      {
        name: "  AI Requirement Workshop  ",
        ownerUserId: "user-owner",
      },
      createdAt,
    );

    expect(state.organizations).toEqual([
      {
        id: "organization-001",
        name: "AI Requirement Workshop",
        slug: "ai-requirement-workshop",
        status: "active",
        createdByUserId: "user-owner",
        createdAt,
        updatedAt: createdAt,
      },
    ]);
    expect(state.memberships).toEqual([
      {
        id: "membership-001",
        organizationId: "organization-001",
        userId: "user-owner",
        role: "owner",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
    ]);
  });

  it("keeps organization slugs unique without mutating the prior state", () => {
    const first = createOrganization(
      emptyOrganizationState,
      { name: "AI Requirement Workshop", ownerUserId: "user-owner" },
      createdAt,
    );
    const second = createOrganization(
      first,
      { name: "AI Requirement Workshop", ownerUserId: "user-second-owner" },
      "2026-07-06T08:01:00.000Z",
    );

    expect(
      first.organizations.map((organization) => organization.slug),
    ).toEqual(["ai-requirement-workshop"]);
    expect(
      second.organizations.map((organization) => organization.slug),
    ).toEqual(["ai-requirement-workshop", "ai-requirement-workshop-2"]);
  });

  it("normalizes pending invites and replaces an existing pending invite for the same email", () => {
    const organization = createTestOrganization();
    const invited = inviteOrganizationMember(
      organization,
      {
        organizationId: "organization-001",
        email: "  Facilitator@Example.COM ",
        role: "facilitator",
        invitedByUserId: "user-owner",
      },
      createdAt,
    );
    const replaced = inviteOrganizationMember(
      invited,
      {
        organizationId: "organization-001",
        email: "facilitator@example.com",
        role: "member",
        invitedByUserId: "user-owner",
        expiresAt: "2026-07-30T08:00:00.000Z",
      },
      "2026-07-06T08:05:00.000Z",
    );

    expect(replaced.invites).toHaveLength(1);
    expect(replaced.invites[0]).toMatchObject({
      id: "invite-001",
      organizationId: "organization-001",
      email: "facilitator@example.com",
      role: "member",
      status: "pending",
      invitedByUserId: "user-owner",
      expiresAt: "2026-07-30T08:00:00.000Z",
      createdAt,
      updatedAt: "2026-07-06T08:05:00.000Z",
    });
  });

  it("accepts a pending invite by creating an active membership and closing the invite", () => {
    const invited = inviteOrganizationMember(
      createTestOrganization(),
      {
        organizationId: "organization-001",
        email: "facilitator@example.com",
        role: "facilitator",
        invitedByUserId: "user-owner",
      },
      createdAt,
    );

    const accepted = acceptOrganizationInvite(
      invited,
      {
        inviteId: "invite-001",
        userId: "user-facilitator",
        email: "FACILITATOR@example.com",
      },
      "2026-07-07T08:00:00.000Z",
    );

    expect(accepted.invites[0]).toMatchObject({
      status: "accepted",
      acceptedByUserId: "user-facilitator",
      acceptedAt: "2026-07-07T08:00:00.000Z",
    });
    expect(accepted.memberships).toContainEqual({
      id: "membership-002",
      organizationId: "organization-001",
      userId: "user-facilitator",
      role: "facilitator",
      status: "active",
      createdAt: "2026-07-07T08:00:00.000Z",
      updatedAt: "2026-07-07T08:00:00.000Z",
    });
  });

  it("rejects expired, revoked, and email-mismatched invites", () => {
    const invited = inviteOrganizationMember(
      createTestOrganization(),
      {
        organizationId: "organization-001",
        email: "member@example.com",
        role: "member",
        invitedByUserId: "user-owner",
        expiresAt: "2026-07-07T08:00:00.000Z",
      },
      createdAt,
    );
    const expired = expireOrganizationInvites(
      invited,
      "2026-07-07T08:00:00.000Z",
    );
    const freshInvite = inviteOrganizationMember(
      createTestOrganization(),
      {
        organizationId: "organization-001",
        email: "viewer@example.com",
        role: "viewer",
        invitedByUserId: "user-owner",
      },
      createdAt,
    );
    const revoked = revokeOrganizationInvite(
      freshInvite,
      "invite-001",
      "user-owner",
      "2026-07-06T08:10:00.000Z",
    );

    expect(() =>
      acceptOrganizationInvite(
        expired,
        {
          inviteId: "invite-001",
          userId: "user-member",
          email: "member@example.com",
        },
        "2026-07-07T08:01:00.000Z",
      ),
    ).toThrowError("Organization invite is not pending.");
    expect(() =>
      acceptOrganizationInvite(
        revoked,
        {
          inviteId: "invite-001",
          userId: "user-viewer",
          email: "viewer@example.com",
        },
        "2026-07-06T08:11:00.000Z",
      ),
    ).toThrowError("Organization invite is not pending.");
    expect(() =>
      acceptOrganizationInvite(
        invited,
        {
          inviteId: "invite-001",
          userId: "user-member",
          email: "someone-else@example.com",
        },
        "2026-07-06T08:10:00.000Z",
      ),
    ).toThrowError("Organization invite email does not match.");
  });

  it("enforces role-based workshop access by active organization membership", () => {
    const state = withMembers([
      { userId: "user-admin", role: "admin" },
      { userId: "user-facilitator", role: "facilitator" },
      { userId: "user-member", role: "member" },
      { userId: "user-viewer", role: "viewer" },
    ]);
    const workshop = {
      id: "workshop-001",
      organizationId: "organization-001",
    };

    expect(
      canAccessWorkshop(state, "user-owner", workshop, "manage-organization"),
    ).toBe(true);
    expect(
      canAccessWorkshop(state, "user-admin", workshop, "manage-organization"),
    ).toBe(false);
    expect(
      canAccessWorkshop(state, "user-facilitator", workshop, "edit-workshop"),
    ).toBe(true);
    expect(
      canAccessWorkshop(state, "user-member", workshop, "edit-workshop"),
    ).toBe(false);
    expect(
      canAccessWorkshop(state, "user-viewer", workshop, "view-workshop"),
    ).toBe(true);
    expect(
      checkOrganizationAccess(
        state,
        "user-outsider",
        "organization-001",
        "view-workshop",
      ),
    ).toMatchObject({
      allowed: false,
      reason: "membership-missing",
    });
  });

  it("blocks inactive memberships from workshop access", () => {
    const state = updateOrganizationMembershipStatus(
      withMembers([{ userId: "user-member", role: "member" }]),
      {
        organizationId: "organization-001",
        userId: "user-member",
        status: "suspended",
        updatedByUserId: "user-owner",
      },
      "2026-07-06T08:10:00.000Z",
    );

    expect(
      checkOrganizationAccess(
        state,
        "user-member",
        "organization-001",
        "view-workshop",
      ),
    ).toMatchObject({
      allowed: false,
      reason: "membership-inactive",
      role: "member",
    });
  });

  it("limits role grants and keeps at least one active owner", () => {
    const withAdmin = withMembers([{ userId: "user-admin", role: "admin" }]);

    expect(() =>
      inviteOrganizationMember(
        withAdmin,
        {
          organizationId: "organization-001",
          email: "admin-two@example.com",
          role: "admin",
          invitedByUserId: "user-admin",
        },
        createdAt,
      ),
    ).toThrowError("User cannot grant that organization role.");
    expect(() =>
      updateOrganizationMembershipRole(
        withAdmin,
        {
          organizationId: "organization-001",
          userId: "user-owner",
          role: "admin",
          updatedByUserId: "user-owner",
        },
        "2026-07-06T08:10:00.000Z",
      ),
    ).toThrowError("Organization must keep at least one active owner.");
    expect(() =>
      updateOrganizationMembershipStatus(
        withAdmin,
        {
          organizationId: "organization-001",
          userId: "user-owner",
          status: "removed",
          updatedByUserId: "user-owner",
        },
        "2026-07-06T08:10:00.000Z",
      ),
    ).toThrowError("Organization must keep at least one active owner.");

    const withSecondOwner = {
      ...withAdmin,
      memberships: [
        ...withAdmin.memberships,
        {
          id: "membership-003",
          organizationId: "organization-001",
          userId: "user-owner-two",
          role: "owner" as const,
          status: "active" as const,
          createdAt,
          updatedAt: createdAt,
        },
      ],
    };

    expect(() =>
      updateOrganizationMembershipRole(
        withSecondOwner,
        {
          organizationId: "organization-001",
          userId: "user-owner-two",
          role: "member",
          updatedByUserId: "user-admin",
        },
        "2026-07-06T08:10:00.000Z",
      ),
    ).toThrowError("User cannot manage that organization membership.");
  });
});

function createTestOrganization() {
  return createOrganization(
    emptyOrganizationState,
    {
      name: "AI Requirement Workshop",
      ownerUserId: "user-owner",
    },
    createdAt,
  );
}

function withMembers(
  members: {
    userId: string;
    role: "admin" | "facilitator" | "member" | "viewer";
  }[],
): OrganizationState {
  const organization = createTestOrganization();

  return {
    ...organization,
    memberships: [
      ...organization.memberships,
      ...members.map((member, index) => ({
        id: `membership-${String(index + 2).padStart(3, "0")}`,
        organizationId: "organization-001",
        userId: member.userId,
        role: member.role,
        status: "active" as const,
        createdAt,
        updatedAt: createdAt,
      })),
    ],
  };
}
