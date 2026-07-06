import {
  expect,
  test,
  type Download,
  type Page,
  type Route,
} from "@playwright/test";
import { readFile } from "node:fs/promises";

test.describe("production workshop hardening", () => {
  test("runs the production-critical happy path from auth gate to report and export access", async ({
    page,
  }) => {
    await installProductionCodexFakes(page);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /collaborative requirement room/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: /authentication required/i }),
    ).toBeVisible();

    await registerWithFrontendFallback(page, {
      displayName: "Production Reviewer",
      email: "production-reviewer@example.com",
    });

    await expect(
      page.getByRole("region", { name: /authentication required/i }),
    ).toHaveCount(0);
    await expect(page.getByLabel(/signed-in account/i)).toContainText(
      "Production Reviewer",
    );
    await expect(
      page.getByRole("region", { name: /workshop room/i }),
    ).toBeVisible();
    await expect(page.getByRole("log")).toHaveAttribute("aria-live", "polite");
    await expect(
      page.getByRole("region", { name: /prototype preview/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /generate prototype/i }),
    ).toBeDisabled();

    const message =
      "A production dispatcher needs stale incident data highlighted before dispatch decisions are confirmed.";
    await page.getByLabel(/describe, challenge, or refine/i).fill(message);
    await page.getByRole("button", { name: /^send$/i }).click();

    await expect(page.getByRole("log").getByText(message)).toBeVisible();
    await expect(
      page.getByText(/what measurable behavior proves stale-data handling/i),
    ).toBeVisible();

    await approveVisibleRequirementPath(page);
    await expect(
      page.locator(".canvas-panel").getByText("1 accepted"),
    ).toBeVisible();

    await page.getByRole("button", { name: /generate prototype/i }).click();
    await expect(
      page
        .frameLocator("iframe[title='Generated prototype preview']")
        .getByRole("heading", { name: /prototype v1/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: /prototype preview/i }),
    ).toContainText(/\d+\/\d+ covered/);

    await page.getByRole("button", { name: /^report$/i }).click();
    const report = page.getByRole("dialog", { name: /workshop report/i });
    await expect(report).toBeVisible();
    await expect(report).toHaveAttribute("aria-modal", "true");
    await expect(report).toContainText("Generated output");
    await expect(report).toContainText("Requirement Candidates");
    await expect(report).toContainText("Requirement candidate");

    const reportDownload = await downloadFrom(page, async () => {
      await report.getByRole("button", { name: /download markdown/i }).click();
    });
    expect(reportDownload.suggestedFilename()).toBe(
      "ai-requirement-workshop-report.md",
    );
    const reportMarkdown = await readDownloadText(reportDownload);
    expect(reportMarkdown).toContain("# Workshop");
    expect(reportMarkdown).toContain("## Requirement Candidates");
    expect(reportMarkdown).toContain("Requirement candidate");
    expect(reportMarkdown).toContain(message);

    await report.getByRole("button", { name: /close report/i }).click();
    await expect(report).toHaveCount(0);

    const exportDownload = await downloadFrom(page, async () => {
      await page.getByRole("button", { name: /^export$/i }).click();
    });
    expect(exportDownload.suggestedFilename()).toMatch(/\.ai-workshop\.json$/);
    const exportEnvelope = JSON.parse(
      await readDownloadText(exportDownload),
    ) as {
      kind?: unknown;
      provenance?: {
        counts?: {
          artifacts?: unknown;
          messages?: unknown;
          prototypes?: unknown;
          prototypeVersions?: unknown;
        };
      };
      record?: {
        session?: {
          artifacts?: Array<{ title?: unknown; status?: unknown }>;
          prototypes?: unknown[];
        };
      };
    };

    expect(exportEnvelope.kind).toBe("AI_REQUIREMENT_WORKSHOP_RECORD_EXPORT");
    expect(exportEnvelope.provenance?.counts?.messages).toBeGreaterThanOrEqual(
      3,
    );
    expect(exportEnvelope.provenance?.counts?.artifacts).toBeGreaterThanOrEqual(
      3,
    );
    expect(exportEnvelope.provenance?.counts?.prototypes).toBe(1);
    expect(exportEnvelope.provenance?.counts?.prototypeVersions).toBe(1);
    expect(exportEnvelope.record?.session?.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "accepted",
        }),
      ]),
    );
    expect(exportEnvelope.record?.session?.prototypes).toHaveLength(1);
  });
});

async function registerWithFrontendFallback(
  page: Page,
  user: { displayName: string; email: string },
) {
  await page.getByRole("button", { name: /^sign in$/i }).click();
  const authDialog = page.getByRole("dialog", { name: /authentication/i });
  await expect(authDialog).toBeVisible();
  await expect(authDialog).toHaveAttribute("aria-modal", "true");
  await expect(authDialog.getByText("Frontend adapter")).toBeVisible();

  await authDialog
    .getByRole("button", { name: /^register$/i })
    .first()
    .click();
  await authDialog.getByLabel(/display name/i).fill(user.displayName);
  await authDialog.getByLabel(/^email$/i).fill(user.email);
  await authDialog
    .getByLabel(/^password$/i)
    .fill("production-smoke-passphrase");
  await authDialog
    .getByRole("button", { name: /^register$/i })
    .last()
    .click();
}

async function approveVisibleRequirementPath(page: Page) {
  const consolidationPanel = page.getByRole("heading", {
    name: /requirement suggestions/i,
  });
  const hasConsolidationPanel = await consolidationPanel.isVisible();
  if (hasConsolidationPanel) {
    const candidateSuggestion = page
      .locator(".consolidation-card")
      .filter({ hasText: "Requirement candidate duplicate" })
      .first();
    const applyButton = candidateSuggestion
      .getByRole("button", { name: /^apply$/i })
      .first();
    if (
      (await candidateSuggestion.count()) > 0 &&
      (await applyButton.count()) > 0 &&
      (await applyButton.isEnabled())
    ) {
      await applyButton.click();
      await expect(
        page.locator(".canvas-panel").getByText("1 accepted"),
      ).toBeVisible();
      return;
    }
  }

  const requirementsPanel = page.getByRole("region", {
    name: /requirements management/i,
  });
  if (await requirementsPanel.isVisible()) {
    await requirementsPanel
      .getByRole("button", {
        name: "Approve Requirement candidate",
        exact: true,
      })
      .first()
      .click();
    return;
  }

  // TODO: Remove this fallback once the production requirements UI is always
  // present. It keeps the smoke path meaningful for older app revisions.
  await page
    .getByRole("button", { name: /inspect requirement candidate/i })
    .click();
  const detailRail = page.getByLabel(/participants and selected artifact/i);
  await expect(detailRail).toContainText("Requirement candidate");
  await detailRail.getByRole("button", { name: /^accept$/i }).click();
}

async function installProductionCodexFakes(page: Page) {
  await page.route("**/api/codex/status", async (route) => {
    await route.fulfill(
      json({
        configured: true,
        model: "gpt-5.5",
        message: "E2E production Codex fake is active.",
      }),
    );
  });

  await page.route("**/api/codex/workshop-turn", async (route) => {
    const body = route.request().postDataJSON() as { message?: string };
    const message = body.message ?? "No production workshop message supplied.";

    await route.fulfill(
      json({
        turn: {
          facilitatorMessage:
            "I captured this for production review. What measurable behavior proves stale-data handling before dispatch?",
          artifacts: [
            {
              type: "problem",
              title: "Stale dispatch data risk",
              content: message,
              createdBy: "facilitator",
              tags: ["production", "e2e"],
            },
            {
              type: "requirement",
              title: "Requirement candidate",
              content: `The future solution should highlight stale incident data before dispatch confirmation and show source freshness: ${message}`,
              createdBy: "agent-quality",
              tags: ["production", "testability"],
            },
            {
              type: "requirement",
              title: "Requirement candidate duplicate",
              content: `The future solution should highlight stale incident data before dispatch confirmation and show source freshness: ${message}`,
              createdBy: "agent-quality",
              tags: ["production", "testability"],
            },
          ],
          participantUpdates: [
            {
              participantId: "agent-quality",
              status: "commenting",
              currentActivity:
                "Reviewing production requirement coverage and testability",
            },
          ],
        },
      }),
    );
  });

  await page.route("**/api/workshops/backup", async (route) => {
    await route.fulfill(
      json({
        backedUpAt: "2026-07-06T08:30:00.000Z",
        message: "Saved in browser and backed up by the production E2E fake.",
      }),
    );
  });
}

async function downloadFrom(page: Page, action: () => Promise<void>) {
  const downloadPromise = page.waitForEvent("download");
  await action();
  return downloadPromise;
}

async function readDownloadText(download: Download) {
  const path = await download.path();
  if (!path) {
    throw new Error(`Download ${download.suggestedFilename()} has no path.`);
  }

  return readFile(path, "utf8");
}

function json(body: unknown): Parameters<Route["fulfill"]>[0] {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}
