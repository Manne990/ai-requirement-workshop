import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  createInitialWorkshopSession,
  participantIds,
} from "./domain/workshop";
import {
  createWorkshopRecord,
  createWorkshopRecordExport,
} from "./persistence/workshopStore";

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", createFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(
      screen.getByText(/what observable behavior proves/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("button", { name: /requirement candidate/i })[0],
    );
    const selectedPanel = screen.getByLabelText(
      /participants and selected artifact/i,
    );
    fireEvent.click(
      within(selectedPanel).getByRole("button", { name: /accept/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /report/i }));

    const report = screen.getByRole("dialog", { name: /workshop report/i });
    expect(within(report).getByText(/generated output/i)).toBeInTheDocument();
    expect(
      within(report).getByText(/requirement candidates/i),
    ).toBeInTheDocument();
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
    await waitFor(() =>
      expect(
        window.localStorage.getItem(
          "ai-requirement-workshop:v3-workshop-records",
        ),
      ).toContain("cross-agency handover"),
    );

    unmount();
    render(<App />);

    expect(
      await screen.findAllByText(/cross-agency handover/i),
    ).not.toHaveLength(0);
    expect(screen.getAllByText(/requirement candidate/i)).not.toHaveLength(0);
  });

  it("shows unread agent insights with a raised hand until the agent panel is opened", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/describe, challenge, or refine/i), {
      target: {
        value:
          "A dashboard should show alarm status and operational risk for SOS staff.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findByLabelText(/quality lens has 1 new insights/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /quality lens insights/i }),
    );

    const panel = screen.getByRole("dialog", {
      name: /quality lens insights/i,
    });
    expect(
      within(panel).getByText(/requirement candidate/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/quality lens has 1 new insights/i),
    ).not.toBeInTheDocument();
  });

  it("exposes the frontend auth shell from the workshop topbar", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /^sign in$/i }));

    const dialog = screen.getByRole("dialog", { name: /authentication/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /register/i }));
    fireEvent.change(within(dialog).getByLabelText(/display name/i), {
      target: { value: "Citizen Two" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^email$/i), {
      target: { value: "citizen-02@example.com" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^password$/i), {
      target: { value: "workshop-passphrase" },
    });

    const registerButtons = within(dialog).getAllByRole("button", {
      name: /^register$/i,
    });
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    const account = await screen.findByLabelText(/signed-in account/i);
    expect(within(account).getByText("Citizen Two")).toBeInTheDocument();

    fireEvent.click(within(account).getByRole("button", { name: /sign out/i }));

    expect(
      await screen.findByRole("button", { name: /^sign in$/i }),
    ).toBeInTheDocument();
  });

  it("attaches files to a workshop turn as source artifacts", async () => {
    render(<App />);

    const file = new File(["alarm_id,status\n1,active"], "alarms.csv", {
      type: "text/csv",
    });
    fireEvent.change(screen.getByLabelText(/attach workshop files/i), {
      target: { files: [file] },
    });

    expect(await screen.findByText(/alarms.csv/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/describe, challenge, or refine/i), {
      target: { value: "Use the attached alarm list." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findAllByText(/alarms.csv/i)).not.toHaveLength(0);
    expect(await screen.findAllByText(/source/i)).not.toHaveLength(0);
  });

  it("imports a durable workshop record export", async () => {
    render(<App />);

    const session = createInitialWorkshopSession(
      "2026-07-06T08:00:00.000Z",
      "imported-workshop",
    );
    session.messages.push({
      id: "imported-human-message",
      participantId: participantIds.human,
      kind: "human-input",
      body: "Imported workshop about connected alarm monitoring.",
      relatedArtifactIds: [],
      createdAt: "2026-07-06T08:01:00.000Z",
    });
    session.updatedAt = "2026-07-06T08:01:00.000Z";
    const record = createWorkshopRecord(session);
    const file = new File(
      [JSON.stringify(createWorkshopRecordExport(record))],
      "workshop.ai-workshop.json",
      { type: "application/json" },
    );

    fireEvent.change(screen.getByLabelText(/import workshop file/i), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText(/imported workshop about connected alarm/i),
    ).toBeInTheDocument();
    expect(await screen.findAllByText(/backed up/i)).not.toHaveLength(0);
  });
});

function createFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith("/api/codex/status")) {
      return jsonResponse({
        configured: true,
        model: "gpt-5.5",
        message: "Local Codex token loaded from environment.",
      });
    }

    if (url.endsWith("/api/codex/workshop-turn")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        message?: string;
        attachments?: { name: string }[];
      };
      const message = body.message ?? "";
      return jsonResponse({
        turn: {
          facilitatorMessage:
            "I captured this on the canvas. What observable behavior proves the dashboard solves the problem?",
          artifacts: [
            ...(body.attachments ?? []).map((attachment) => ({
              type: "question",
              title: `Review ${attachment.name}`,
              content: "Which parts of the attachment are still current?",
              createdBy: "agent-quality",
              tags: ["attachment-review"],
            })),
            {
              type: "problem",
              title: "Digital system need",
              content: message,
              createdBy: "facilitator",
              tags: ["from-test"],
            },
            {
              type: "requirement",
              title: "Requirement candidate",
              content: `The future solution should support: ${message}`,
              createdBy: "agent-quality",
              tags: ["testability"],
            },
          ],
        },
      });
    }

    if (url.endsWith("/api/workshops/backup")) {
      return jsonResponse({
        backedUpAt: "2026-07-06T08:30:00.000Z",
        message: "Saved in browser and backed up to disk.",
      });
    }

    return jsonResponse({ error: "Unexpected endpoint." }, 404);
  });
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
