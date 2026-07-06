import {
  Building2,
  CircleCheck,
  MailCheck,
  ShieldAlert,
  Users,
} from "lucide-react";
import {
  organizationPermissionsByRole,
  roleHasPermission,
  type OrganizationAccessDecision,
  type OrganizationInvite,
  type OrganizationInviteStatus,
  type OrganizationPermission,
  type OrganizationRole,
} from "../domain/organization";
import type { OrganizationMembershipContext } from "../persistence/organizationRepository";
import "./OrganizationPanel.css";

export type OrganizationPanelAccessCheck = {
  permission: OrganizationPermission;
  decision: OrganizationAccessDecision;
  label?: string;
};

export type OrganizationPanelProps = {
  membershipContext: OrganizationMembershipContext | null;
  memberCount: number;
  invites: OrganizationInvite[];
  accessChecks?: OrganizationPanelAccessCheck[];
  className?: string;
};

const inviteStatuses: OrganizationInviteStatus[] = [
  "pending",
  "accepted",
  "revoked",
  "expired",
];

export function OrganizationPanel({
  membershipContext,
  memberCount,
  invites,
  accessChecks = [],
  className,
}: OrganizationPanelProps) {
  const organization = membershipContext?.organization;
  const membership = membershipContext?.membership;
  const organizationInvites = organization
    ? invites.filter((invite) => invite.organizationId === organization.id)
    : [];
  const inviteSummaries = summarizeInvites(organizationInvites);
  const warnings = organization
    ? organizationWarnings(membershipContext, accessChecks)
    : ["No active organization is selected."];
  const normalizedMemberCount = Math.max(0, memberCount);

  return (
    <section
      className={["organization-panel", className].filter(Boolean).join(" ")}
      aria-label="Organization access"
    >
      <div className="organization-panel__header">
        <div>
          <p className="eyebrow">Organization</p>
          <h2>{organization?.name ?? "No organization"}</h2>
          <span>
            {organization
              ? `${organization.slug} · ${organization.status}`
              : "Select an organization before opening workshop access."}
          </span>
        </div>
        <span
          className={`organization-panel__status organization-panel__status--${
            organization?.status ?? "missing"
          }`}
        >
          <Building2 aria-hidden="true" size={16} />
          {organization?.status ?? "missing"}
        </span>
      </div>

      <dl className="organization-panel__metrics">
        <div>
          <dt>
            <Users aria-hidden="true" size={16} />
            Members
          </dt>
          <dd>
            {normalizedMemberCount}
            <span>active member{normalizedMemberCount === 1 ? "" : "s"}</span>
          </dd>
        </div>
        <div>
          <dt>
            <CircleCheck aria-hidden="true" size={16} />
            Role
          </dt>
          <dd>
            {membership ? formatRole(membership.role) : "None"}
            <span>{membership?.status ?? "no membership"}</span>
          </dd>
        </div>
        <div>
          <dt>
            <MailCheck aria-hidden="true" size={16} />
            Invites
          </dt>
          <dd>
            {organizationInvites.length}
            <span>
              {organizationInvites.length === 0
                ? "no invites tracked"
                : inviteSummaries.join(" · ")}
            </span>
          </dd>
        </div>
      </dl>

      {membership ? (
        <div className="organization-panel__permissions">
          {organizationPermissionsByRole[membership.role].map((permission) => (
            <span key={permission}>{formatPermission(permission)}</span>
          ))}
        </div>
      ) : null}

      {accessChecks.length > 0 ? (
        <ul className="organization-panel__access" aria-label="Access checks">
          {accessChecks.map((check) => (
            <li
              className={
                check.decision.allowed
                  ? "organization-panel__access-item organization-panel__access-item--allowed"
                  : "organization-panel__access-item organization-panel__access-item--denied"
              }
              key={`${check.permission}-${check.label ?? check.decision.reason}`}
            >
              <span>{check.label ?? formatPermission(check.permission)}</span>
              <strong>
                {check.decision.allowed
                  ? "allowed"
                  : accessReasonLabel(check.decision.reason)}
              </strong>
            </li>
          ))}
        </ul>
      ) : null}

      <div
        className={
          warnings.length === 0
            ? "organization-panel__warnings organization-panel__warnings--clear"
            : "organization-panel__warnings"
        }
      >
        <div className="organization-panel__warnings-title">
          <ShieldAlert aria-hidden="true" size={16} />
          <span>
            {warnings.length === 0 ? "Access clear" : "Access warnings"}
          </span>
        </div>
        {warnings.length === 0 ? (
          <p>No organization access warnings for the current role.</p>
        ) : (
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function summarizeInvites(invites: OrganizationInvite[]) {
  return inviteStatuses.flatMap((status) => {
    const count = invites.filter((invite) => invite.status === status).length;
    return count === 0
      ? []
      : `${count} ${status} invite${count === 1 ? "" : "s"}`;
  });
}

function organizationWarnings(
  membershipContext: OrganizationMembershipContext,
  accessChecks: OrganizationPanelAccessCheck[],
) {
  const { organization, membership } = membershipContext;
  const warnings: string[] = [];

  if (organization.status !== "active") {
    warnings.push("Organization is archived, so workshop access is blocked.");
  }

  if (membership.status !== "active") {
    warnings.push(
      `Membership is ${membership.status}, so organization access is inactive.`,
    );
  }

  if (!roleHasPermission(membership.role, "invite-members")) {
    warnings.push(`${formatRole(membership.role)} role cannot invite members.`);
  }

  if (!roleHasPermission(membership.role, "manage-members")) {
    warnings.push(`${formatRole(membership.role)} role cannot manage members.`);
  }

  for (const check of accessChecks) {
    if (!check.decision.allowed) {
      warnings.push(
        `${check.label ?? formatPermission(check.permission)} blocked: ${accessReasonLabel(
          check.decision.reason,
        )}.`,
      );
    }
  }

  return warnings;
}

function formatRole(role: OrganizationRole) {
  return role
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPermission(permission: OrganizationPermission) {
  return permission
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function accessReasonLabel(reason: OrganizationAccessDecision["reason"]) {
  switch (reason) {
    case "allowed":
      return "allowed";
    case "organization-missing":
      return "organization missing";
    case "organization-archived":
      return "organization archived";
    case "user-missing":
      return "user missing";
    case "membership-missing":
      return "membership missing";
    case "membership-inactive":
      return "membership inactive";
    case "role-lacks-permission":
      return "role lacks permission";
  }
}
