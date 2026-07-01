import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("runs the basic workshop loop from chat input to report output", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /collaborative requirement room/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/welcome\. describe what digital system/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/describe, challenge, or refine/i), {
      target: {
        value:
          "A dispatcher needs a system that should summarize related incidents, show data source confidence, and flag critical risks.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findAllByText(/requirement candidate/i),
    ).not.toHaveLength(0);
    expect(screen.getByText(/next question/i)).toBeInTheDocument();

    const selectedPanel = screen.getByLabelText(
      /participants and selected artifact/i,
    );
    fireEvent.click(
      within(selectedPanel).getByRole("button", { name: /accept/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /report/i }));

    const report = screen.getByRole("dialog", { name: /workshop report/i });
    expect(within(report).getByText(/generated output/i)).toBeInTheDocument();
    expect(within(report).getByText(/context and goals/i)).toBeInTheDocument();
  });

  it("restores an in-progress workshop from local storage after remount", async () => {
    const { unmount } = render(<App />);

    fireEvent.change(screen.getByLabelText(/describe, challenge, or refine/i), {
      target: {
        value:
          "A coordinator needs a system that should track cross-agency handover gaps before dispatch review.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findAllByText(/cross-agency handover/i),
    ).not.toHaveLength(0);

    unmount();
    render(<App />);

    expect(screen.getAllByText(/cross-agency handover/i)).not.toHaveLength(0);
    expect(screen.getAllByText(/requirement candidate/i)).not.toHaveLength(0);
  });
});
