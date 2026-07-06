import {
  AlertTriangle,
  Archive,
  Check,
  GitCompareArrows,
  History,
  X,
} from "lucide-react";
import { useState } from "react";
import "./RequirementsPanel.css";
import {
  groupRequirementsByLifecycle,
  requirementLifecycleLabel,
  requirementLifecycleOrder,
  type RequirementLifecycleStatus,
  type RequirementPanelItem,
} from "../domain/requirements";
import type { RequirementQualityFinding } from "../domain/requirementQuality";

type RequirementAction = "approve" | "reject" | "supersede" | "baseline";

export type RequirementsPanelProps = {
  requirements: RequirementPanelItem[];
  qualityFindings?: RequirementQualityFinding[];
  selectedRequirementId?: string;
  onSelectRequirement?: (requirement: RequirementPanelItem) => void;
  onApprove?: (requirement: RequirementPanelItem) => void;
  onReject?: (requirement: RequirementPanelItem) => void;
  onSupersede?: (requirement: RequirementPanelItem) => void;
  onBaseline?: (requirement: RequirementPanelItem) => void;
};

const statusSummaryOrder: RequirementLifecycleStatus[] = [
  "approved",
  "candidate",
  "draft",
  "baselined",
];

export function RequirementsPanel({
  requirements,
  qualityFindings = [],
  selectedRequirementId,
  onSelectRequirement,
  onApprove,
  onReject,
  onSupersede,
  onBaseline,
}: RequirementsPanelProps) {
  const groupedRequirements = groupRequirementsByLifecycle(requirements);
  const totalCount = requirements.length;

  return (
    <section
      className="requirements-panel"
      aria-label="Requirements management"
    >
      <header className="requirements-panel__header">
        <div>
          <p className="requirements-panel__eyebrow">Requirements</p>
          <h2>Approval queue</h2>
        </div>
        <span className="requirements-panel__total">
          {totalCount} requirement{totalCount === 1 ? "" : "s"}
        </span>
      </header>

      <div
        className="requirements-panel__summary"
        aria-label="Requirement status summary"
      >
        {statusSummaryOrder.map((status) => (
          <div
            className={`requirements-panel__metric status-${status}`}
            key={status}
          >
            <strong>{groupedRequirements[status].length}</strong>
            <span>{requirementLifecycleLabel[status]}</span>
          </div>
        ))}
      </div>

      {requirements.length === 0 ? (
        <p className="requirements-panel__empty">
          No requirement candidates have been captured yet.
        </p>
      ) : (
        <div className="requirements-panel__groups">
          {requirementLifecycleOrder.map((status) => (
            <RequirementGroup
              key={status}
              status={status}
              requirements={groupedRequirements[status]}
              qualityFindings={qualityFindings}
              selectedRequirementId={selectedRequirementId}
              onSelectRequirement={onSelectRequirement}
              onApprove={onApprove}
              onReject={onReject}
              onSupersede={onSupersede}
              onBaseline={onBaseline}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RequirementGroup({
  status,
  requirements,
  qualityFindings,
  selectedRequirementId,
  onSelectRequirement,
  onApprove,
  onReject,
  onSupersede,
  onBaseline,
}: {
  status: RequirementLifecycleStatus;
  requirements: RequirementPanelItem[];
  qualityFindings: RequirementQualityFinding[];
  selectedRequirementId?: string;
  onSelectRequirement?: (requirement: RequirementPanelItem) => void;
  onApprove?: (requirement: RequirementPanelItem) => void;
  onReject?: (requirement: RequirementPanelItem) => void;
  onSupersede?: (requirement: RequirementPanelItem) => void;
  onBaseline?: (requirement: RequirementPanelItem) => void;
}) {
  return (
    <section
      className="requirements-panel__group"
      aria-labelledby={`requirements-${status}`}
    >
      <div className="requirements-panel__group-heading">
        <h3 id={`requirements-${status}`}>
          {requirementLifecycleLabel[status]}
        </h3>
        <span>{requirements.length}</span>
      </div>
      {requirements.length === 0 ? (
        <p className="requirements-panel__group-empty">
          No {status} requirements.
        </p>
      ) : (
        <div className="requirements-panel__cards">
          {requirements.map((requirement) => (
            <RequirementCard
              key={requirement.id}
              requirement={requirement}
              qualityFindings={qualityFindings.filter(
                (finding) => finding.artifactId === requirement.id,
              )}
              isSelected={requirement.id === selectedRequirementId}
              onSelectRequirement={onSelectRequirement}
              onApprove={onApprove}
              onReject={onReject}
              onSupersede={onSupersede}
              onBaseline={onBaseline}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RequirementCard({
  requirement,
  qualityFindings,
  isSelected,
  onSelectRequirement,
  onApprove,
  onReject,
  onSupersede,
  onBaseline,
}: {
  requirement: RequirementPanelItem;
  qualityFindings: RequirementQualityFinding[];
  isSelected: boolean;
  onSelectRequirement?: (requirement: RequirementPanelItem) => void;
  onApprove?: (requirement: RequirementPanelItem) => void;
  onReject?: (requirement: RequirementPanelItem) => void;
  onSupersede?: (requirement: RequirementPanelItem) => void;
  onBaseline?: (requirement: RequirementPanelItem) => void;
}) {
  const sourceCount =
    requirement.sourceArtifactIds.length + requirement.sourceMessageIds.length;
  const latestHistory = requirement.history.at(-1);
  const [isApprovalConfirmationOpen, setIsApprovalConfirmationOpen] =
    useState(false);
  const blockingFindingCount = qualityFindings.filter(
    (finding) => finding.severity === "blocker",
  ).length;

  return (
    <article
      className={`requirement-card status-${requirement.status}${
        isSelected ? " is-selected" : ""
      }`}
    >
      <button
        className="requirement-card__body"
        type="button"
        aria-label={requirement.title}
        aria-pressed={isSelected}
        onClick={() => onSelectRequirement?.(requirement)}
      >
        <div className="requirement-card__heading">
          <span>{requirementLifecycleLabel[requirement.status]}</span>
          {requirement.version ? <small>v{requirement.version}</small> : null}
        </div>
        <h4>{requirement.title}</h4>
        <p>{requirement.statement}</p>
      </button>

      <div
        className="requirement-card__meta"
        aria-label={`${requirement.title} metadata`}
      >
        {requirement.owner ? <span>{requirement.owner}</span> : null}
        {sourceCount > 0 ? (
          <span>
            {sourceCount} source{sourceCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {latestHistory ? (
          <span>
            <History aria-hidden="true" size={13} />
            {latestHistory.reason ??
              requirementLifecycleLabel[latestHistory.toStatus]}
          </span>
        ) : null}
      </div>

      {requirement.tags.length > 0 ? (
        <div
          className="requirement-card__tags"
          aria-label={`${requirement.title} tags`}
        >
          {requirement.tags.slice(0, 4).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}

      {qualityFindings.length > 0 ? (
        <div
          className={`requirement-card__quality${
            blockingFindingCount > 0 ? " has-blockers" : ""
          }`}
          aria-label={`${requirement.title} quality suggestions`}
        >
          <div>
            <AlertTriangle aria-hidden="true" size={14} />
            <strong>
              {qualityFindings.length} quality suggestion
              {qualityFindings.length === 1 ? "" : "s"}
            </strong>
            {blockingFindingCount > 0 ? (
              <span>{blockingFindingCount} blocking</span>
            ) : null}
          </div>
          <ul>
            {qualityFindings.slice(0, 3).map((finding) => (
              <li key={finding.id}>{finding.question}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="requirement-card__actions">
        <ActionButton
          action="approve"
          label="Approve"
          requirement={requirement}
          onAction={
            onApprove ? () => setIsApprovalConfirmationOpen(true) : undefined
          }
        />
        <ActionButton
          action="reject"
          label="Reject"
          requirement={requirement}
          onAction={onReject}
        />
        <ActionButton
          action="supersede"
          label="Supersede"
          requirement={requirement}
          onAction={onSupersede}
        />
        <ActionButton
          action="baseline"
          label="Baseline"
          requirement={requirement}
          onAction={onBaseline}
        />
      </div>

      {isApprovalConfirmationOpen ? (
        <div
          className="requirement-card__approval-confirmation"
          role="group"
          aria-label={`Approval confirmation for ${requirement.title}`}
        >
          <div>
            <strong>Confirm approval</strong>
            <span>{requirementLifecycleLabel[requirement.status]}</span>
          </div>
          <p>
            Approving includes this requirement in reports and prototype inputs.
          </p>
          <blockquote>{requirement.statement}</blockquote>
          <small>
            {sourceCount} source{sourceCount === 1 ? "" : "s"} linked
          </small>
          <div>
            <button
              type="button"
              onClick={() => {
                onApprove?.(requirement);
                setIsApprovalConfirmationOpen(false);
              }}
              aria-label={`Confirm approve ${requirement.title}`}
            >
              <Check aria-hidden="true" size={15} />
              Confirm approve
            </button>
            <button
              type="button"
              onClick={() => setIsApprovalConfirmationOpen(false)}
              aria-label={`Cancel approve ${requirement.title}`}
            >
              <X aria-hidden="true" size={15} />
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ActionButton({
  action,
  label,
  requirement,
  onAction,
}: {
  action: RequirementAction;
  label: string;
  requirement: RequirementPanelItem;
  onAction?: (requirement: RequirementPanelItem) => void;
}) {
  const Icon = actionIcon[action];
  const isDisabled = !onAction || !canRunAction(action, requirement.status);

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-label={`${label} ${requirement.title}`}
      onClick={() => onAction?.(requirement)}
      title={label}
    >
      <Icon aria-hidden="true" size={15} />
      <span>{label}</span>
    </button>
  );
}

const actionIcon: Record<RequirementAction, typeof Check> = {
  approve: Check,
  reject: X,
  supersede: GitCompareArrows,
  baseline: Archive,
};

function canRunAction(
  action: RequirementAction,
  status: RequirementLifecycleStatus,
) {
  if (status === "rejected" || status === "superseded") {
    return false;
  }

  if (action === "approve") {
    return status === "draft" || status === "candidate";
  }

  if (action === "baseline") {
    return status === "approved";
  }

  if (action === "supersede") {
    return (
      status === "candidate" || status === "approved" || status === "baselined"
    );
  }

  return status !== "baselined";
}
