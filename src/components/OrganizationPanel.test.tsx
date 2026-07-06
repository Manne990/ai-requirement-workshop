import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  Organization,
  OrganizationInvite,
  OrganizationMembership,
} from "../domain/organization";
import { OrganizationPanel } from "./OrganizationPanel";

const createdAt = "2026-07-06T08:00:00.000Z";

describe("OrganizationPanel", () => {
  it("renders organization, role, member count, invites, and granted permissions", () => {
    render(
      <OrganizationPanel
        membershipContext={{
          organization: organization(),
          membership: membership({ role: "owner" }),
        }}
        memberCount={3}
        invites={[
          invite({ id: "invite-1", status: "pending" }),
          invite({ id: "invite-2", status: "accepted" }),
          invite({
            id: "invite-other",
            organizationId: "organization-other",
            status: "pending",
          }),
        ]}
        accessChecks={[
          {
            permission: "manage-organization",
            label: "Admin console",
            decision: {
              allowed: true,
              reason: "allowed",
              role: "owner",
              membershipId: "membership-1",
            },
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "AI Requirement Workshop" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ai-requirement-workshop · active")).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.getByText("active members")).toBeVisible();
    expect(screen.getByText("Owner")).toBeVisible();
    expect(
      screen.getByText("1 pending invite · 1 accepted invite"),
    ).toBeVisible();
    expect(screen.getByText("Manage Organization")).toBeVisible();

    const accessChecks = screen.getByLabelText("Access checks");
    expect(within(accessChecks).getByText("Admin console")).toBeVisible();
    expect(within(accessChecks).getByText("allowed")).toBeVisible();
    expect(screen.getByText("Access clear")).toBeVisible();
  });

  it("shows deterministic warnings for limited roles and denied access checks", () => {
    render(
      <OrganizationPanel
        membershipContext={{
          organization: organization(),
          membership: membership({ role: "viewer" }),
        }}
        memberCount={1}
        invites={[invite({ id: "invite-1", status: "expired" })]}
        accessChecks={[
          {
            permission: "edit-workshop",
            label: "Edit workshop",
            decision: {
              allowed: false,
              reason: "role-lacks-permission",
              role: "viewer",
              membershipId: "membership-1",
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("Viewer")).toBeVisible();
    expect(screen.getByText("1 expired invite")).toBeVisible();
    expect(
      screen.getByText("Viewer role cannot invite members."),
    ).toBeVisible();
    expect(
      screen.getByText("Viewer role cannot manage members."),
    ).toBeVisible();
    expect(
      screen.getByText("Edit workshop blocked: role lacks permission."),
    ).toBeVisible();
  });

  it("renders an empty organization state without requiring repository access", () => {
    render(
      <OrganizationPanel
        membershipContext={null}
        memberCount={-4}
        invites={[invite({ id: "invite-1", status: "pending" })]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No organization" }),
    ).toBeVisible();
    expect(screen.getAllByText("0")).toHaveLength(2);
    expect(screen.getByText("no membership")).toBeVisible();
    expect(screen.getByText("no invites tracked")).toBeVisible();
    expect(
      screen.getByText("No active organization is selected."),
    ).toBeVisible();
  });
});

function organization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "organization-1",
    name: "AI Requirement Workshop",
    slug: "ai-requirement-workshop",
    status: "active",
    createdByUserId: "user-owner",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function membership(
  overrides: Partial<OrganizationMembership> = {},
): OrganizationMembership {
  return {
    id: "membership-1",
    organizationId: "organization-1",
    userId: "user-owner",
    role: "owner",
    status: "active",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function invite(
  overrides: Partial<OrganizationInvite> = {},
): OrganizationInvite {
  return {
    id: "invite-1",
    organizationId: "organization-1",
    email: "teammate@example.com",
    tokenHash: "invite-token",
    role: "participant",
    status: "pending",
    invitedByUserId: "user-owner",
    expiresAt: "2026-07-20T08:00:00.000Z",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}
