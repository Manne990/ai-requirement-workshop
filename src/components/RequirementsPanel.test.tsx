import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RequirementsPanel } from "./RequirementsPanel";
import {
  selectRequirementPanelItems,
  type RequirementPanelItem,
} from "../domain/requirements";
import type { WorkshopArtifact } from "../domain/workshop";

describe("RequirementsPanel", () => {
  it("groups requirement lifecycles so the review queue is scannable", () => {
    render(<RequirementsPanel requirements={requirements} />);

    expect(screen.getByText("4 requirements")).toBeInTheDocument();
    expect(metric("Approved")).toHaveTextContent("1Approved");
    expect(metric("Candidate")).toHaveTextContent("1Candidate");
    expect(metric("Draft")).toHaveTextContent("1Draft");
    expect(metric("Baselined")).toHaveTextContent("1Baselined");

    expect(group("Candidate")).toHaveTextContent("Incident summary");
    expect(group("Approved")).toHaveTextContent("Confidence label");
    expect(group("Draft")).toHaveTextContent("Audit log");
    expect(group("Baselined")).toHaveTextContent("Critical risk alert");
  });

  it("exposes approve, reject, supersede, baseline, and selection callbacks", () => {
    const onSelectRequirement = vi.fn();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onSupersede = vi.fn();
    const onBaseline = vi.fn();

    render(
      <RequirementsPanel
        requirements={requirements}
        selectedRequirementId="req-approved"
        onSelectRequirement={onSelectRequirement}
        onApprove={onApprove}
        onReject={onReject}
        onSupersede={onSupersede}
        onBaseline={onBaseline}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Incident summary" }));
    expect(onSelectRequirement).toHaveBeenCalledWith(
      expect.objectContaining({ id: "req-candidate" }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Approve Incident summary" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reject Incident summary" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Supersede Confidence label" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Baseline Confidence label" }),
    );

    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "req-candidate" }),
    );
    expect(onReject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "req-candidate" }),
    );
    expect(onSupersede).toHaveBeenCalledWith(
      expect.objectContaining({ id: "req-approved" }),
    );
    expect(onBaseline).toHaveBeenCalledWith(
      expect.objectContaining({ id: "req-approved" }),
    );
  });

  it("derives panel requirements from existing requirement artifacts", () => {
    const artifacts: WorkshopArtifact[] = [
      artifact({
        id: "artifact-1",
        status: "accepted",
        tags: ["candidate"],
      }),
      artifact({
        id: "artifact-2",
        status: "draft",
        tags: ["baseline"],
      }),
      artifact({
        id: "artifact-3",
        status: "draft",
        type: "risk",
        tags: ["candidate"],
      }),
    ];

    const selected = selectRequirementPanelItems(artifacts);

    expect(selected).toHaveLength(2);
    expect(selected.map((requirement) => requirement.status)).toEqual([
      "approved",
      "baselined",
    ]);
    expect(selected[0]?.sourceMessageIds).toEqual(["message-1"]);
  });
});

const requirements: RequirementPanelItem[] = [
  {
    id: "req-candidate",
    title: "Incident summary",
    statement: "The system should summarize related incidents before review.",
    status: "candidate",
    version: "0.2",
    owner: "agent-quality",
    updatedAt: "2026-07-06T10:00:00.000Z",
    tags: ["testable"],
    sourceArtifactIds: ["artifact-1"],
    sourceMessageIds: ["message-1"],
    history: [],
  },
  {
    id: "req-approved",
    title: "Confidence label",
    statement: "Each displayed data point must show source confidence.",
    status: "approved",
    version: "1.0",
    owner: "facilitator",
    updatedAt: "2026-07-06T10:01:00.000Z",
    tags: ["report"],
    sourceArtifactIds: ["artifact-2"],
    sourceMessageIds: ["message-2"],
    history: [
      {
        id: "history-1",
        changedAt: "2026-07-06T10:01:00.000Z",
        changedBy: "workshop-owner",
        fromStatus: "candidate",
        toStatus: "approved",
        reason: "Accepted for report",
      },
    ],
  },
  {
    id: "req-draft",
    title: "Audit log",
    statement: "The system should keep an audit trail for requirement changes.",
    status: "draft",
    tags: [],
    sourceArtifactIds: [],
    sourceMessageIds: [],
    history: [],
  },
  {
    id: "req-baselined",
    title: "Critical risk alert",
    statement: "Baselined release scope includes critical risk alerts.",
    status: "baselined",
    tags: ["baseline"],
    sourceArtifactIds: ["artifact-4"],
    sourceMessageIds: [],
    history: [],
  },
];

function metric(label: string) {
  const summary = screen.getByLabelText("Requirement status summary");
  return within(summary).getByText(label).closest("div") as HTMLElement;
}

function group(label: string) {
  const heading = screen.getByRole("heading", { name: label });
  return heading.closest("section") as HTMLElement;
}

function artifact({
  id,
  status,
  tags,
  type = "requirement",
}: Pick<WorkshopArtifact, "id" | "status" | "tags"> &
  Partial<Pick<WorkshopArtifact, "type">>): WorkshopArtifact {
  return {
    id,
    type,
    title: "Requirement candidate",
    content: "The system should expose a requirement lifecycle.",
    status,
    createdBy: "facilitator",
    updatedAt: "2026-07-06T10:00:00.000Z",
    source: { messageId: "message-1", participantId: "human-1" },
    tags,
  };
}
