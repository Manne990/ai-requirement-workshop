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
import { readMissionControlTelemetryRecords } from "./persistence/missionControlTelemetrySink";

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
    await registerForWorkshopAccess();

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
    expect(await screen.findByText(/captured/i)).toBeInTheDocument();

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

  it("shows the human message immediately while the Codex turn is pending", async () => {
    let resolveWorkshopTurn: (() => void) | undefined;
    const pendingFetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
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
          };
          return await new Promise<Response>((resolve) => {
            resolveWorkshopTurn = () =>
              resolve(
                jsonResponse({
                  turn: {
                    facilitatorMessage:
                      "Jag har fångat detta. Vilket mätbart beteende visar att dashboarden löser problemet?",
                    artifacts: [
                      {
                        type: "problem",
                        title: "Digitalt övervakningsbehov",
                        content: body.message ?? "",
                        createdBy: "facilitator",
                        tags: ["from-test"],
                      },
                    ],
                  },
                }),
              );
          });
        }

        if (url.endsWith("/api/workshops/backup")) {
          return jsonResponse({
            backedUpAt: "2026-07-06T08:30:00.000Z",
            message: "Saved in browser and backed up to disk.",
          });
        }

        return jsonResponse({ error: "Unexpected endpoint." }, 404);
      },
    );
    vi.stubGlobal("fetch", pendingFetchMock);

    render(<App />);
    await registerForWorkshopAccess();

    fireEvent.change(screen.getByLabelText(/describe, challenge, or refine/i), {
      target: {
        value:
          "Här på SOS-alarm behöver vi bygga ett dashboard-system för larmsystem.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findByText(/Här på SOS-alarm behöver vi bygga/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /codex thinking/i }),
    ).toBeDisabled();
    expect(
      screen.queryByText(/Vilket mätbart beteende visar/i),
    ).not.toBeInTheDocument();

    resolveWorkshopTurn?.();

    expect(
      await screen.findByText(/Vilket mätbart beteende visar/i),
    ).toBeInTheDocument();
  });

  it("generates a prototype preview and records prototype feedback", async () => {
    render(<App />);
    await registerForWorkshopAccess();

    fireEvent.change(screen.getByLabelText(/describe, challenge, or refine/i), {
      target: {
        value:
          "A dispatcher dashboard should show alarm status and stale data risk before dispatch.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findAllByText(/requirement candidate/i),
    ).not.toHaveLength(0);

    fireEvent.click(
      screen.getByRole("button", { name: /generate prototype/i }),
    );

    expect(
      await screen.findByTitle(/generated prototype preview/i),
    ).toHaveAttribute("sandbox", "");
    expect(screen.getByText(/1\/1 covered/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^element$/i), {
      target: { value: "prototype-element-v1-02" },
    });
    fireEvent.change(screen.getByLabelText(/prototype feedback/i), {
      target: {
        value: "Change the preview because stale data risk must be first.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /add feedback/i }));

    expect(
      await screen.findByText(/what mitigation or acceptance check/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/prototype risk:/i)).not.toHaveLength(0);
  });

  it("restores an in-progress workshop from local storage after remount", async () => {
    const { unmount } = render(<App />);
    await registerForWorkshopAccess();

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
    await registerForWorkshopAccess();

    expect(
      await screen.findAllByText(/cross-agency handover/i),
    ).not.toHaveLength(0);
    expect(screen.getAllByText(/requirement candidate/i)).not.toHaveLength(0);
  });

  it("shows unread agent insights with a raised hand until the agent panel is opened", async () => {
    render(<App />);
    await registerForWorkshopAccess();

    fireEvent.change(screen.getByLabelText(/describe, challenge, or refine/i), {
      target: {
        value:
          "A dashboard should show alarm status and operational risk for SOS staff.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findByLabelText(/quality lens has \d+ new insights/i),
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
      screen.queryByLabelText(/quality lens has \d+ new insights/i),
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

  it("creates an organization context and scopes saved workshops to it", async () => {
    render(<App />);
    await registerForWorkshopAccess();

    expect(
      await screen.findByRole("region", { name: /organization access/i }),
    ).toHaveTextContent("Workshop Tester's organization");
    expect(screen.getAllByText(/open workshops/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/edit workshops/i).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText(/describe, challenge, or refine/i), {
      target: {
        value:
          "A product owner needs organization-scoped workshops before inviting colleagues.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findAllByText(/organization-scoped workshops/i);
    await waitFor(() => {
      const records = JSON.parse(
        window.localStorage.getItem(
          "ai-requirement-workshop:v3-workshop-records",
        ) ?? "[]",
      ) as Array<{ organizationId?: string; title?: string }>;
      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            organizationId: "organization-001",
            title: expect.stringContaining("organization-scoped workshops"),
          }),
        ]),
      );
    });
  });

  it("attaches files to a workshop turn as source artifacts", async () => {
    render(<App />);
    await registerForWorkshopAccess();

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
    await registerForWorkshopAccess();

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
      await screen.findAllByText(/imported workshop about connected alarm/i),
    ).not.toHaveLength(0);
    expect(await screen.findAllByText(/backed up/i)).not.toHaveLength(0);
  });

  it("runs a CI-safe production smoke through auth, workshop opening, requirement approval, and report view", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /^sign in$/i }));
    const authDialog = screen.getByRole("dialog", { name: /authentication/i });
    fireEvent.click(
      within(authDialog).getByRole("button", { name: /register/i }),
    );
    fireEvent.change(within(authDialog).getByLabelText(/display name/i), {
      target: { value: "Release Reviewer" },
    });
    fireEvent.change(within(authDialog).getByLabelText(/^email$/i), {
      target: { value: "release-reviewer@example.com" },
    });
    fireEvent.change(within(authDialog).getByLabelText(/^password$/i), {
      target: { value: "production-smoke-passphrase" },
    });

    const registerButtons = within(authDialog).getAllByRole("button", {
      name: /^register$/i,
    });
    fireEvent.click(registerButtons[registerButtons.length - 1]);
    expect(
      await screen.findByLabelText(/signed-in account/i),
    ).toHaveTextContent("Release Reviewer");

    const workshopSelect = screen.getByLabelText(
      /open workshop/i,
    ) as HTMLSelectElement;
    await waitFor(() => expect(workshopSelect).not.toBeDisabled());
    expect(workshopSelect.options.length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText(/describe, challenge, or refine/i), {
      target: {
        value:
          "A release operator needs a system that should approve high-risk requirement changes before deployment.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findAllByRole("button", { name: /requirement candidate/i }),
    ).not.toHaveLength(0);

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

  it("records Mission Control telemetry for runtime workshop actions", async () => {
    render(<App />);
    await registerForWorkshopAccess();

    await waitForTelemetryEvent("auth.boundary");
    await waitForTelemetryEvent("workshop.opened");

    await sendWorkshopMessage(
      "A telemetry owner needs a system that should trace requirement decisions before release.",
    );
    await screen.findAllByRole("button", { name: /requirement candidate/i });
    await waitForTelemetryEvent("message.sent");

    fireEvent.click(
      screen.getByRole("button", { name: /approve requirement candidate/i }),
    );
    await waitForTelemetryEvent("requirement.approved");

    fireEvent.click(
      screen.getByRole("button", { name: /baseline requirement candidate/i }),
    );
    await waitForTelemetryEvent("requirement.baselined");

    fireEvent.click(
      screen.getByRole("button", { name: /generate prototype/i }),
    );
    await screen.findByTitle(/generated prototype preview/i);
    await waitForTelemetryEvent("prototype.generated");

    fireEvent.click(
      screen.getByRole("button", { name: /supersede requirement candidate/i }),
    );
    await waitForTelemetryEvent("requirement.superseded");

    await sendWorkshopMessage(
      "A release auditor needs a system that should reject stale checklist requirements.",
    );
    await screen.findAllByRole("button", {
      name: /reject requirement candidate/i,
    });
    fireEvent.click(
      screen.getAllByRole("button", {
        name: /reject requirement candidate/i,
      })[0],
    );
    await waitForTelemetryEvent("requirement.rejected");

    expect(
      readMissionControlTelemetryRecords().map((record) => record.event.name),
    ).toEqual(
      expect.arrayContaining([
        "auth.boundary",
        "workshop.opened",
        "message.sent",
        "requirement.approved",
        "requirement.baselined",
        "requirement.superseded",
        "requirement.rejected",
        "prototype.generated",
      ]),
    );
  });

  it("records Mission Control telemetry for consolidation review decisions", async () => {
    render(<App />);
    await registerForWorkshopAccess();

    await sendWorkshopMessage(
      "A coordinator needs a system that should show dispatch risk and should show dispatch risk sources.",
    );

    fireEvent.click(await findConsolidationButtonByName(/apply/i));
    await waitForTelemetryEvent("consolidation.applied");

    await sendWorkshopMessage(
      "A reviewer needs a system that should flag stale incident details and should flag stale incident sources.",
    );

    fireEvent.click(await findConsolidationButtonByName(/park/i));
    await waitForTelemetryEvent("consolidation.parked");
  });

  it("exposes accessible regions, stateful controls, and dismissible dialogs for the workshop shell", async () => {
    render(<App />);
    await registerForWorkshopAccess();

    expect(screen.getByLabelText(/workshop status/i)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /workshop room/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /zoomable workshop canvas/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: /workshop chat/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
    expect(
      screen.getByLabelText(/participants and selected artifact/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/workshop readiness \d+%/i),
    ).toBeInTheDocument();

    const processMode = screen.getByRole("button", { name: /process/i });
    const risksMode = screen.getByRole("button", { name: /risks/i });
    expect(processMode).toHaveAttribute("aria-pressed", "true");
    risksMode.focus();
    expect(risksMode).toHaveFocus();
    fireEvent.click(risksMode);
    expect(risksMode).toHaveAttribute("aria-pressed", "true");
    expect(processMode).toHaveAttribute("aria-pressed", "false");

    const reportButton = screen.getByRole("button", { name: /report/i });
    reportButton.focus();
    expect(reportButton).toHaveFocus();
    fireEvent.click(reportButton);
    const report = screen.getByRole("dialog", { name: /workshop report/i });
    expect(report).toHaveAttribute("aria-modal", "true");
    fireEvent.click(within(report).getByRole("button", { name: /close/i }));
    expect(
      screen.queryByRole("dialog", { name: /workshop report/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps responsive overflow and scroll ownership rules under Vitest coverage", async () => {
    const [appCss, rootCss] = await Promise.all([
      readLocalText("src/App.css"),
      readLocalText("src/index.css"),
    ]);
    const appShellBlock = cssBlock(appCss, ".app-shell");
    const workspaceBlock = cssBlock(appCss, ".workspace-grid");
    const messageListBlock = cssBlock(appCss, ".message-list");
    const participantsStripBlock = cssBlock(appCss, ".participants-strip");

    expect(rootCss).toMatch(/html\s*{[\s\S]*overflow:\s*hidden/);
    expect(rootCss).toMatch(/body\s*{[\s\S]*overflow:\s*hidden/);
    expect(rootCss).toMatch(/#root\s*{[\s\S]*overflow:\s*hidden/);
    expect(appShellBlock).toContain("height: 100dvh");
    expect(appShellBlock).toContain("overflow: hidden");
    expect(workspaceBlock).toContain("display: grid");
    expect(workspaceBlock).toContain("grid-template-columns:");
    expect(workspaceBlock).toMatch(/minmax\(0,\s*1(\.\d+)?fr\)/);
    expect(workspaceBlock).toContain("overflow: hidden");
    expect(messageListBlock).toContain("overflow-y: auto");
    expect(participantsStripBlock).toContain("overflow-x: auto");
    expect(participantsStripBlock).toContain("overflow-y: hidden");
    expect(appCss).toMatch(
      /@media \(max-width:\s*600px\)\s*{[\s\S]*\.workspace-grid\s*{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
  });
});

async function readLocalText(filePath: string) {
  const nodeFs = (await import("node:" + "fs")) as {
    readFileSync: (path: string, encoding: "utf8") => string;
  };
  return nodeFs.readFileSync(filePath, "utf8");
}

function cssBlock(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*{([\\s\\S]*?)\\n}`).exec(css);
  expect(match?.[1]).toBeDefined();
  return match![1];
}

async function registerForWorkshopAccess() {
  fireEvent.click(await screen.findByRole("button", { name: /^sign in$/i }));

  const dialog = screen.getByRole("dialog", { name: /authentication/i });
  fireEvent.click(within(dialog).getByRole("button", { name: /register/i }));
  fireEvent.change(within(dialog).getByLabelText(/display name/i), {
    target: { value: "Workshop Tester" },
  });
  fireEvent.change(within(dialog).getByLabelText(/^email$/i), {
    target: { value: "tester@example.com" },
  });
  fireEvent.change(within(dialog).getByLabelText(/^password$/i), {
    target: { value: "workshop-passphrase" },
  });
  const registerButtons = within(dialog).getAllByRole("button", {
    name: /^register$/i,
  });
  fireEvent.click(registerButtons[registerButtons.length - 1]);

  await screen.findByLabelText(/signed-in account/i);
}

async function sendWorkshopMessage(message: string) {
  fireEvent.change(screen.getByLabelText(/describe, challenge, or refine/i), {
    target: { value: message },
  });
  fireEvent.click(screen.getByRole("button", { name: /send/i }));
}

async function waitForTelemetryEvent(eventName: string) {
  await waitFor(() =>
    expect(
      readMissionControlTelemetryRecords().map((record) => record.event.name),
    ).toContain(eventName),
  );
}

async function findConsolidationButtonByName(name: RegExp) {
  const panel = await screen.findByRole("region", {
    name: /requirement suggestions/i,
  });

  return await waitFor(() => {
    const button = within(panel)
      .getAllByRole("button", { name })
      .find((candidate) => !candidate.hasAttribute("disabled"));
    expect(button).toBeDefined();
    return button!;
  });
}

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
