import { expect, test, type Page, type Route } from "@playwright/test";

test.describe("returning auth and workshop opening", () => {
  test("signs in again and explicitly opens a saved workshop", async ({
    page,
  }) => {
    await installCodexFakes(page);
    await page.goto("/");

    await registerWithFrontendFallback(page, {
      displayName: "Returning Reviewer",
      email: "returning-reviewer@example.com",
    });

    const firstMessage =
      "A returning reviewer needs the first workshop to survive sign out and later reopening.";
    await sendWorkshopMessage(page, firstMessage);
    await expect(page.getByRole("log").getByText(firstMessage)).toBeVisible();
    const workshopSelect = page.getByLabel(/open workshop/i) as ReturnType<
      Page["locator"]
    >;
    await expect(workshopSelect).toBeEnabled();
    const firstWorkshopId = await workshopSelect.inputValue();

    await page.getByRole("button", { name: /^new$/i }).click();
    const secondMessage =
      "A returning reviewer needs a second workshop so the opener has a real choice.";
    await sendWorkshopMessage(page, secondMessage);
    await expect(page.getByRole("log").getByText(secondMessage)).toBeVisible();
    const secondWorkshopId = await workshopSelect.inputValue();
    expect(secondWorkshopId).not.toBe(firstWorkshopId);

    await workshopSelect.selectOption(firstWorkshopId);
    await expect(page.getByRole("log").getByText(firstMessage)).toBeVisible();
    await expect(page.getByRole("log").getByText(secondMessage)).toHaveCount(0);

    await page.getByRole("button", { name: /^sign out$/i }).click();
    await expect(
      page.getByRole("region", { name: /authentication required/i }),
    ).toBeVisible();

    await signInWithFrontendFallback(page, {
      email: "returning-reviewer@example.com",
    });
    await expect(page.getByLabel(/signed-in account/i)).toContainText(
      "returning-reviewer",
    );
    await expect(
      page.getByRole("region", { name: /workshop room/i }),
    ).toBeVisible();

    await expect(workshopSelect).toBeEnabled();
    await workshopSelect.selectOption(firstWorkshopId);
    await expect(page.getByRole("log").getByText(firstMessage)).toBeVisible();

    await workshopSelect.selectOption(secondWorkshopId);
    await expect(page.getByRole("log").getByText(secondMessage)).toBeVisible();
  });
});

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
  await authDialog.getByLabel(/^password$/i).fill("returning-smoke-passphrase");
  await authDialog
    .getByRole("button", { name: /^register$/i })
    .last()
    .click();
  await expect(page.getByLabel(/signed-in account/i)).toContainText(
    user.displayName,
  );
}

async function signInWithFrontendFallback(page: Page, user: { email: string }) {
  await page.getByRole("button", { name: /^sign in$/i }).click();
  const authDialog = page.getByRole("dialog", { name: /authentication/i });
  await expect(authDialog).toBeVisible();
  await authDialog.getByLabel(/^email$/i).fill(user.email);
  await authDialog.getByLabel(/^password$/i).fill("returning-smoke-passphrase");
  await authDialog
    .getByRole("button", { name: /^sign in$/i })
    .last()
    .click();
}

async function sendWorkshopMessage(page: Page, message: string) {
  await page.getByLabel(/describe, challenge, or refine/i).fill(message);
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(
    page.getByText(/what evidence should be attached before approval/i),
  ).toBeVisible();
}

async function installCodexFakes(page: Page) {
  await page.route("**/api/codex/status", async (route) => {
    await route.fulfill(
      json({
        configured: true,
        model: "gpt-5.5",
        message: "E2E returning-auth Codex fake is active.",
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
            "I captured this for the returning workshop. What evidence should be attached before approval?",
          artifacts: [
            {
              type: "problem",
              title: "Returning workshop state",
              content: message,
              createdBy: "facilitator",
              tags: ["returning-auth"],
            },
            {
              type: "requirement",
              title: "Requirement candidate",
              content: `The future solution should preserve and reopen this workshop context: ${message}`,
              createdBy: "agent-quality",
              tags: ["persistence"],
            },
          ],
        },
      }),
    );
  });

  await page.route("**/api/workshops/backup", async (route) => {
    await route.fulfill(
      json({
        backedUpAt: "2026-07-06T23:30:00.000Z",
        message: "Saved in browser and backed up by the returning-auth fake.",
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
