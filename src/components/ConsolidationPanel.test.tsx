import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConsolidationPanel, {
  type ConsolidationSuggestion,
} from "./ConsolidationPanel";
import type { WorkshopArtifact } from "../domain/workshop";

describe("ConsolidationPanel", () => {
  it("shows merge and split suggestions with source artifacts and proposed requirement titles", () => {
    render(
      <ConsolidationPanel
        artifacts={artifacts}
        suggestions={suggestions}
        onApplySuggestion={vi.fn()}
        onParkSuggestion={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /requirement suggestions/i }),
    ).toBeInTheDocument();

    const mergeCard = screen
      .getByText("Merge duplicated dispatch requirements")
      .closest("li");
    expect(mergeCard).not.toBeNull();
    expect(within(mergeCard as HTMLElement).getByText("Merge")).toBeVisible();
    expect(
      within(mergeCard as HTMLElement).getByText("Dispatcher summary"),
    ).toBeVisible();
    expect(
      within(mergeCard as HTMLElement).getByText("Incident summary"),
    ).toBeVisible();
    expect(
      within(mergeCard as HTMLElement).getByText(
        "Summarize active incidents for dispatchers",
      ),
    ).toBeVisible();

    const splitCard = screen
      .getByText("Split broad monitoring need")
      .closest("li");
    expect(splitCard).not.toBeNull();
    expect(within(splitCard as HTMLElement).getByText("Split")).toBeVisible();
    expect(
      within(splitCard as HTMLElement).getByText("Monitoring dashboard"),
    ).toBeVisible();
    expect(
      within(splitCard as HTMLElement).getByText("Show source confidence"),
    ).toBeVisible();
    expect(
      within(splitCard as HTMLElement).getByText("Flag critical risks"),
    ).toBeVisible();
  });

  it("requires explicit apply or park actions before invoking callbacks", () => {
    const onApplySuggestion = vi.fn();
    const onParkSuggestion = vi.fn();

    render(
      <ConsolidationPanel
        artifacts={artifacts}
        suggestions={suggestions}
        onApplySuggestion={onApplySuggestion}
        onParkSuggestion={onParkSuggestion}
      />,
    );

    expect(onApplySuggestion).not.toHaveBeenCalled();
    expect(onParkSuggestion).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: /apply/i })[0]);
    expect(onApplySuggestion).toHaveBeenCalledWith("suggestion-merge");
    expect(onParkSuggestion).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: /park/i })[1]);
    expect(onParkSuggestion).toHaveBeenCalledWith("suggestion-split");
  });

  it("disables actions for already applied or parked suggestions", () => {
    render(
      <ConsolidationPanel
        artifacts={artifacts}
        suggestions={[
          { ...suggestions[0], state: "applied" },
          { ...suggestions[1], state: "parked" },
        ]}
        onApplySuggestion={vi.fn()}
        onParkSuggestion={vi.fn()}
      />,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText("Applied")).toBeVisible();
    expect(screen.getByText("Parked")).toBeVisible();
  });
});

const artifacts: Pick<
  WorkshopArtifact,
  "id" | "type" | "title" | "content" | "status"
>[] = [
  {
    id: "artifact-a",
    type: "requirement",
    title: "Dispatcher summary",
    content: "The dashboard should summarize incidents for dispatchers.",
    status: "draft",
  },
  {
    id: "artifact-b",
    type: "requirement",
    title: "Incident summary",
    content: "Dispatchers need a concise active incident summary.",
    status: "draft",
  },
  {
    id: "artifact-c",
    type: "requirement",
    title: "Monitoring dashboard",
    content: "Show confidence and flag critical risks in one broad dashboard.",
    status: "draft",
  },
];

const suggestions: ConsolidationSuggestion[] = [
  {
    id: "suggestion-merge",
    kind: "merge",
    title: "Merge duplicated dispatch requirements",
    rationale:
      "Both requirements describe the same dispatcher incident summary.",
    sourceArtifactIds: ["artifact-a", "artifact-b"],
    proposedRequirements: [
      {
        title: "Summarize active incidents for dispatchers",
        sourceArtifactIds: ["artifact-a", "artifact-b"],
      },
    ],
  },
  {
    id: "suggestion-split",
    kind: "split",
    title: "Split broad monitoring need",
    rationale:
      "The source artifact combines confidence display and risk flags.",
    sourceArtifactIds: ["artifact-c"],
    proposedRequirements: [
      {
        title: "Show source confidence",
        sourceArtifactIds: ["artifact-c"],
      },
      {
        title: "Flag critical risks",
        sourceArtifactIds: ["artifact-c"],
      },
    ],
  },
];
