import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

test.describe("realtime collaboration", () => {
  test("shows two live collaborators and mirrors workshop messages through browser realtime", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await seedSharedOrganization(context);
    const ada = await context.newPage();
    const grace = await context.newPage();
    await installCodexFakes(ada);
    await installCodexFakes(grace);

    await ada.goto("/?workshopId=realtime-e2e-workshop");
    await grace.goto("/?workshopId=realtime-e2e-workshop");
    await registerWithFrontendFallback(ada, {
      displayName: "Ada Reviewer",
      email: "ada-realtime@example.com",
    });
    await registerWithFrontendFallback(grace, {
      displayName: "Grace Reviewer",
      email: "grace-realtime@example.com",
    });

    const adaPresence = ada.getByRole("region", {
      name: /connected collaborators/i,
    });
    const gracePresence = grace.getByRole("region", {
      name: /connected collaborators/i,
    });
    await expect(adaPresence).toContainText("Ada Reviewer");
    await expect(adaPresence).toContainText("Grace Reviewer");
    await expect(gracePresence).toContainText("Ada Reviewer");
    await expect(gracePresence).toContainText("Grace Reviewer");

    const message =
      "A realtime reviewer needs everyone in the same workshop to see new requirements without reload.";
    await ada.getByLabel(/describe, challenge, or refine/i).fill(message);
    await ada.getByRole("button", { name: /^send$/i }).click();

    await expect(grace.getByRole("log").getByText(message)).toBeVisible();
    await expect(
      grace.getByRole("button", { name: /inspect requirement candidate/i }),
    ).toBeVisible();

    await grace
      .getByRole("button", { name: /inspect requirement candidate/i })
      .click();
    await grace
      .getByLabel(/participants and selected artifact/i)
      .getByRole("button", { name: /^accept$/i })
      .click();

    await expect(
      ada.locator(".canvas-panel").getByText("1 accepted"),
    ).toBeVisible();

    await context.close();
  });
});

async function seedSharedOrganization(context: BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem(
      "ai-requirement-workshop:v1-organization-state",
      JSON.stringify({
        organizations: [
          {
            id: "organization-001",
            name: "Realtime Test Organization",
            slug: "realtime-test-organization",
            status: "active",
            createdByUserId: "auth-user:ada-realtime@example.com",
            createdAt: "2026-07-06T22:10:00.000Z",
            updatedAt: "2026-07-06T22:10:00.000Z",
          },
        ],
        memberships: [
          {
            id: "membership-001",
            organizationId: "organization-001",
            userId: "auth-user:ada-realtime@example.com",
            role: "owner",
            status: "active",
            createdAt: "2026-07-06T22:10:00.000Z",
            updatedAt: "2026-07-06T22:10:00.000Z",
          },
          {
            id: "membership-002",
            organizationId: "organization-001",
            userId: "auth-user:grace-realtime@example.com",
            role: "facilitator",
            status: "active",
            createdAt: "2026-07-06T22:10:00.000Z",
            updatedAt: "2026-07-06T22:10:00.000Z",
          },
        ],
        invites: [],
      }),
    );
    window.localStorage.setItem(
      "ai-requirement-workshop:v1-active-organization",
      JSON.stringify({
        "auth-user:ada-realtime@example.com": "organization-001",
        "auth-user:grace-realtime@example.com": "organization-001",
      }),
    );
  });
}

async function registerWithFrontendFallback(
  page: Page,
  user: { displayName: string; email: string },
) {
  await page.getByRole("button", { name: /^sign in$/i }).click();
  const authDialog = page.getByRole("dialog", { name: /authentication/i });
  await expect(authDialog).toBeVisible();
  await authDialog
    .getByRole("button", { name: /^register$/i })
    .first()
    .click();
  await authDialog.getByLabel(/display name/i).fill(user.displayName);
  await authDialog.getByLabel(/^email$/i).fill(user.email);
  await authDialog.getByLabel(/^password$/i).fill("realtime-passphrase");
  await authDialog
    .getByRole("button", { name: /^register$/i })
    .last()
    .click();
  await expect(page.getByLabel(/signed-in account/i)).toContainText(
    user.displayName,
  );
}

async function installCodexFakes(page: Page) {
  await page.route("**/api/codex/status", async (route) => {
    await route.fulfill(
      json({
        configured: true,
        model: "gpt-5.5",
        message: "Realtime E2E Codex fake is active.",
      }),
    );
  });

  await page.route("**/api/codex/workshop-turn", async (route) => {
    const body = route.request().postDataJSON() as { message?: string };
    const message = body.message ?? "No workshop message supplied.";
    await route.fulfill(
      json({
        turn: {
          facilitatorMessage:
            "I captured this as a realtime requirement candidate. What acceptance check should prove it works?",
          artifacts: [
            {
              type: "requirement",
              title: "Requirement candidate",
              content: `The future solution should support: ${message}`,
              createdBy: "agent-quality",
              tags: ["realtime", "e2e"],
            },
          ],
        },
      }),
    );
  });

  await page.route("**/api/workshops/backup", async (route) => {
    await route.fulfill(
      json({
        backedUpAt: "2026-07-06T22:15:00.000Z",
        message: "Saved in browser and backed up by the realtime E2E fake.",
      }),
    );
  });
}

function json(body: unknown): Parameters<Route["fulfill"]>[0] {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}
