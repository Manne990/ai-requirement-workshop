import { beforeEach, describe, expect, it } from "vitest";
import type { OrganizationState } from "../domain/organization";
import {
  createLocalActiveOrganizationStore,
  createLocalOrganizationStateStore,
  createOrganizationRepository,
  createSupabaseOrganizationStateStore,
  organizationStateFromSupabaseRows,
  organizationStateToSupabaseRows,
  type ActiveOrganizationStore,
  type OrganizationStateStore,
  type SupabaseOrganizationRows,
} from "./organizationRepository";

const createdAt = "2026-07-06T08:00:00.000Z";

describe("organizationRepository", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists organizations, memberships, and invites through the local fallback", async () => {
    const repository = createOrganizationRepository({
      stateStore: createLocalOrganizationStateStore(),
      activeOrganizationStore: createLocalActiveOrganizationStore(),
    });

    await repository.createOrganization(
      {
        name: "  Workshop Team  ",
        ownerUserId: "user-owner",
      },
      createdAt,
    );
    await repository.inviteMember(
      {
        organizationId: "organization-001",
        email: "Participant@Example.com",
        tokenHash: "sha256:participant-token",
        role: "participant",
        invitedByUserId: "user-owner",
      },
      "2026-07-06T08:01:00.000Z",
    );
    await repository.acceptInvite(
      {
        tokenHash: "sha256:participant-token",
        userId: "user-participant",
        email: "participant@example.com",
      },
      "2026-07-06T08:02:00.000Z",
    );

    const reloadedRepository = createOrganizationRepository({
      stateStore: createLocalOrganizationStateStore(),
      activeOrganizationStore: createLocalActiveOrganizationStore(),
    });

    await expect(
      reloadedRepository.listMembershipsForUser("user-participant"),
    ).resolves.toEqual([
      expect.objectContaining({
        organization: expect.objectContaining({
          id: "organization-001",
          slug: "workshop-team",
        }),
        membership: expect.objectContaining({
          userId: "user-participant",
          role: "participant",
          status: "active",
        }),
      }),
    ]);
    await expect(reloadedRepository.loadState()).resolves.toMatchObject({
      invites: [
        expect.objectContaining({
          tokenHash: "sha256:participant-token",
          status: "accepted",
        }),
      ],
    });
  });

  it("selects only organizations the user can view", async () => {
    const repository = createOrganizationRepository({
      stateStore: memoryStateStore(seedState()),
      activeOrganizationStore: memoryActiveOrganizationStore(),
    });

    await repository.setActiveOrganizationId("user-owner", "organization-001");

    await expect(
      repository.getActiveOrganizationForUser("user-owner"),
    ).resolves.toMatchObject({
      organization: { id: "organization-001" },
      membership: { role: "owner" },
    });
    await expect(
      repository.setActiveOrganizationId("user-outsider", "organization-001"),
    ).rejects.toThrow("Cannot select organization: membership-missing.");
  });

  it("enforces organization access when listing scoped workshops", async () => {
    const repository = createOrganizationRepository({
      stateStore: memoryStateStore(seedState()),
      activeOrganizationStore: memoryActiveOrganizationStore(),
    });
    const workshops = [
      { id: "workshop-allowed", organizationId: "organization-001" },
      { id: "workshop-blocked", organizationId: "organization-002" },
    ];

    await expect(
      repository.listAccessibleWorkshops(
        "user-facilitator",
        workshops,
        "edit-workshop",
      ),
    ).resolves.toEqual([
      { id: "workshop-allowed", organizationId: "organization-001" },
    ]);
    await expect(
      repository.assertWorkshopAccess(
        "user-viewer",
        workshops[0],
        "edit-workshop",
      ),
    ).rejects.toThrow("Organization access denied: role-lacks-permission.");
    await expect(
      repository.assertWorkshopAccess(
        "user-outsider",
        workshops[0],
        "view-workshop",
      ),
    ).rejects.toThrow("Organization access denied: membership-missing.");
  });

  it("maps Supabase organization rows without leaking snake_case into the domain", async () => {
    const rows: SupabaseOrganizationRows = {
      organizations: [
        {
          id: "organization-001",
          name: "Workshop Team",
          slug: "workshop-team",
          status: "active",
          created_by: "user-owner",
          created_at: createdAt,
          updated_at: createdAt,
        },
      ],
      memberships: [
        {
          id: "membership-001",
          organization_id: "organization-001",
          user_id: "user-owner",
          role: "owner",
          status: "active",
          created_at: createdAt,
          updated_at: createdAt,
        },
      ],
      invites: [
        {
          id: "invite-001",
          organization_id: "organization-001",
          email: "participant@example.com",
          token_hash: "sha256:participant-token",
          role: "participant",
          status: "pending",
          invited_by_user_id: "user-owner",
          expires_at: "2026-07-20T08:00:00.000Z",
          created_at: createdAt,
          updated_at: createdAt,
        },
      ],
    };
    const savedRows: SupabaseOrganizationRows[] = [];
    const store = createSupabaseOrganizationStateStore({
      loadRows: async () => rows,
      saveRows: async (nextRows) => {
        savedRows.push(nextRows);
      },
    });

    await expect(store.loadState()).resolves.toEqual({
      organizations: [
        {
          id: "organization-001",
          name: "Workshop Team",
          slug: "workshop-team",
          status: "active",
          createdByUserId: "user-owner",
          createdAt: createdAt,
          updatedAt: createdAt,
        },
      ],
      memberships: [
        {
          id: "membership-001",
          organizationId: "organization-001",
          userId: "user-owner",
          role: "owner",
          status: "active",
          createdAt: createdAt,
          updatedAt: createdAt,
        },
      ],
      invites: [
        {
          id: "invite-001",
          organizationId: "organization-001",
          email: "participant@example.com",
          tokenHash: "sha256:participant-token",
          role: "participant",
          status: "pending",
          invitedByUserId: "user-owner",
          expiresAt: "2026-07-20T08:00:00.000Z",
          createdAt: createdAt,
          updatedAt: createdAt,
        },
      ],
    });

    const state = organizationStateFromSupabaseRows(rows);
    await store.saveState(state);

    expect(savedRows).toEqual([organizationStateToSupabaseRows(state)]);
  });
});

function seedState(): OrganizationState {
  return {
    organizations: [
      {
        id: "organization-001",
        name: "Allowed Team",
        slug: "allowed-team",
        status: "active",
        createdByUserId: "user-owner",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "organization-002",
        name: "Blocked Team",
        slug: "blocked-team",
        status: "active",
        createdByUserId: "user-other-owner",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    memberships: [
      {
        id: "membership-001",
        organizationId: "organization-001",
        userId: "user-owner",
        role: "owner",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "membership-002",
        organizationId: "organization-001",
        userId: "user-facilitator",
        role: "facilitator",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "membership-003",
        organizationId: "organization-001",
        userId: "user-viewer",
        role: "viewer",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "membership-004",
        organizationId: "organization-002",
        userId: "user-other-owner",
        role: "owner",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    invites: [],
  };
}

function memoryStateStore(
  initialState: OrganizationState,
): OrganizationStateStore {
  let state = initialState;
  return {
    async loadState() {
      return state;
    },
    async saveState(nextState) {
      state = nextState;
    },
  };
}

function memoryActiveOrganizationStore(): ActiveOrganizationStore {
  const activeByUserId: Record<string, string> = {};
  return {
    async getActiveOrganizationId(userId) {
      return activeByUserId[userId] ?? null;
    },
    async setActiveOrganizationId(userId, organizationId) {
      activeByUserId[userId] = organizationId;
    },
  };
}
