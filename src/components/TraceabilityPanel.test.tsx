import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { participantIds, type WorkshopSession } from "../domain/workshop";
import { TraceabilityPanel } from "./TraceabilityPanel";

describe("TraceabilityPanel", () => {
  it("summarizes requirement source, validation, risk, and gap coverage", () => {
    render(<TraceabilityPanel session={traceableSession} />);

    const summary = screen.getByLabelText("Traceability graph summary");
    expect(summary).toHaveTextContent("Nodes");
    expect(summary).toHaveTextContent("Links");
    expect(summary).toHaveTextContent("Gaps");

    const dashboardRow = screen.getByRole("button", {
      name: "Traceability for Customer dashboard",
    });
    expect(dashboardRow).toHaveTextContent("2 Sources");
    expect(dashboardRow).toHaveTextContent("0 Validation");
    expect(dashboardRow).toHaveTextContent("1 Risks");
    expect(dashboardRow).toHaveTextContent("1 Gaps");
    expect(dashboardRow).toHaveTextContent("validation test");

    const orphanRow = screen.getByRole("button", {
      name: "Traceability for Unlinked export",
    });
    expect(orphanRow).toHaveTextContent("0 Sources");
    expect(orphanRow).toHaveTextContent("3 Gaps");
  });

  it("selects the underlying requirement artifact from a traceability row", () => {
    const onSelectArtifact = vi.fn();
    render(
      <TraceabilityPanel
        session={traceableSession}
        selectedNodeId="requirement:req-dashboard"
        onSelectArtifact={onSelectArtifact}
      />,
    );

    const row = screen.getByRole("button", {
      name: "Traceability for Customer dashboard",
    });
    expect(row).toHaveClass("is-selected");

    fireEvent.click(row);

    expect(onSelectArtifact).toHaveBeenCalledWith("req-dashboard");
  });

  it("shows traceability warnings when source references cannot resolve", () => {
    render(<TraceabilityPanel session={sessionWithBrokenSource} />);

    const details = screen.getByText("1 trace warning").closest("details");

    expect(details).toBeInTheDocument();
    expect(within(details as HTMLElement).getByRole("list")).toHaveTextContent(
      "unresolved source artifact missing-source",
    );
  });
});

const createdAt = "2026-07-07T10:00:00.000Z";

const traceableSession: WorkshopSession = {
  id: "workshop-trace",
  title: "Traceability workshop",
  participants: [],
  messages: [
    {
      id: "message-1",
      participantId: participantIds.human,
      kind: "human-input",
      body: "SOS Alarm needs customer alarm dashboards.",
      createdAt,
      relatedArtifactIds: ["source-1", "req-dashboard"],
    },
  ],
  attachments: [],
  artifacts: [
    artifact({
      id: "source-1",
      type: "source",
      title: "Initial brief",
      content: "Customer alarms are connected over 4G into SQL Server.",
    }),
    artifact({
      id: "req-dashboard",
      type: "requirement",
      title: "Customer dashboard",
      content: "The system shall show a customer-specific alarm dashboard.",
    }),
    artifact({
      id: "risk-data-delay",
      type: "risk",
      title: "Delayed alarm data",
      content: "4G delays may hide stale alarm state.",
    }),
    artifact({
      id: "req-orphan",
      type: "requirement",
      title: "Unlinked export",
      content: "The system shall export reports.",
      source: {
        participantId: participantIds.quality,
      },
    }),
  ],
  links: [
    {
      id: "link-source-req",
      sourceArtifactId: "source-1",
      targetArtifactId: "req-dashboard",
      label: "derived from",
    },
    {
      id: "link-req-risk",
      sourceArtifactId: "req-dashboard",
      targetArtifactId: "risk-data-delay",
      label: "risk review",
    },
  ],
  prototypes: [],
  visualizationMode: "requirements",
  followDiscussion: true,
  updatedAt: createdAt,
};

const sessionWithBrokenSource: WorkshopSession = {
  ...traceableSession,
  artifacts: [
    artifact({
      id: "req-broken",
      type: "requirement",
      title: "Broken provenance",
      content: "The system shall keep provenance warnings visible.",
      source: {
        artifactId: "missing-source",
        participantId: participantIds.quality,
      },
    }),
  ],
  links: [],
};

function artifact(
  input: Partial<WorkshopSession["artifacts"][number]> &
    Pick<
      WorkshopSession["artifacts"][number],
      "id" | "type" | "title" | "content"
    >,
): WorkshopSession["artifacts"][number] {
  return {
    status: "accepted",
    createdBy: participantIds.facilitator,
    updatedAt: createdAt,
    source: {
      messageId: "message-1",
      participantId: participantIds.facilitator,
    },
    tags: [],
    ...input,
  };
}
