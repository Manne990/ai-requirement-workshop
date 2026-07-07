import { expect, test, type Page, type Route } from "@playwright/test";

test.describe("workshop feedback loop", () => {
  test("uses frontend auth fallback and keeps a submitted chat message visible while Codex is pending", async ({
    page,
  }) => {
    let releaseWorkshopTurn: (() => void) | undefined;
    await installCodexFakes(page, {
      delayWorkshopTurn: () =>
        new Promise<void>((resolve) => {
          releaseWorkshopTurn = resolve;
        }),
    });

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /collaborative requirement room/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: /authentication required/i }),
    ).toBeVisible();

    await registerWithFrontendFallback(page, {
      displayName: "Gaia Reviewer",
      email: "gaia-reviewer@example.com",
    });

    await expect(page.getByLabel(/signed-in account/i)).toContainText(
      "Gaia Reviewer",
    );
    await expect(
      page.getByRole("region", { name: /workshop room/i }),
    ).toBeVisible();
    await expect(page.getByRole("log")).toHaveAttribute("aria-live", "polite");

    const message =
      "A dispatcher needs a dashboard that shows stale incident data before dispatch.";
    await page.getByLabel(/describe, challenge, or refine/i).fill(message);
    await page.getByRole("button", { name: /^send$/i }).click();

    await expect(page.getByText(message)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /codex thinking/i }),
    ).toBeDisabled();
    await expect(
      page.getByText(/what acceptance criterion would let/i),
    ).toHaveCount(0);

    releaseWorkshopTurn?.();

    await expect(
      page.getByText(/what acceptance criterion would let/i).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /codex thinking/i }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel(/describe, challenge, or refine/i),
    ).toBeEnabled();
  });

  test("approves a requirement, keeps canvas and participants inside the viewport, and records prototype feedback", async ({
    page,
  }) => {
    await installCodexFakes(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto("/");
    await registerWithFrontendFallback(page, {
      displayName: "Layout Reviewer",
      email: "layout-reviewer@example.com",
    });

    await page
      .getByLabel(/describe, challenge, or refine/i)
      .fill(
        "A release operator needs a system that should approve high-risk requirement changes before deployment.",
      );
    await page.getByRole("button", { name: /^send$/i }).click();

    await expect(
      page.getByRole("button", { name: /inspect requirement candidate/i }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /inspect requirement candidate/i })
      .click();

    const detailRail = page.getByLabel(/participants and selected artifact/i);
    await detailRail.getByRole("button", { name: /^accept$/i }).click();
    await expect(
      page.locator(".canvas-panel").getByText("1 accepted"),
    ).toBeVisible();

    await assertNoPageScroll(page);
    const layout = await readLayout(page);
    expect(layout.canvasVisible, "canvas should stay inside the viewport").toBe(
      true,
    );
    expect(
      layout.detailRailVisible,
      "participants/detail rail should stay inside the viewport",
    ).toBe(true);
    expect(
      layout.participantsCanScrollHorizontally,
      "participant strip owns horizontal overflow",
    ).toBe(true);

    await page.getByRole("button", { name: /generate prototype/i }).click();
    await expect(
      page
        .frameLocator("iframe[title='Generated prototype preview']")
        .getByRole("heading", { name: /prototype v1/i }),
    ).toBeVisible();
    await expect(page.getByText("1/1 covered")).toBeVisible();

    await page
      .getByLabel(/prototype feedback/i)
      .fill("Change the prototype because stale data risk must be first.");
    await page.getByRole("button", { name: /add feedback/i }).click();

    await expect(page.getByText(/prototype feedback on/i)).toBeVisible();
    await expect(
      page.getByText(/what mitigation or acceptance check/i),
    ).toBeVisible();

    await assertNoPageScroll(page);
  });

  test("keeps tablet workshop layout scroll-owned and accessible", async ({
    page,
  }) => {
    await installCodexFakes(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await registerWithFrontendFallback(page, {
      displayName: "Tablet Layout Reviewer",
      email: "tablet-layout-reviewer@example.com",
    });

    await expect(
      page.getByRole("region", { name: /workshop room/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: /workshop operations/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/workshop chat/i)).toBeVisible();
    await expect(
      page.getByRole("region", { name: /prototype preview/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: /requirements management/i }),
    ).toBeVisible();
    await expect(page.getByRole("log")).toHaveAttribute("aria-live", "polite");

    await page
      .getByLabel(/describe, challenge, or refine/i)
      .fill(
        "A tablet reviewer needs the workshop operations lane to stay reachable without creating page scroll.",
      );
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(
      page.getByText(/what measurable behavior proves/i),
    ).toBeVisible();

    const layoutBeforePrototype = await readLayout(page);
    expect(layoutBeforePrototype.canvasVisible).toBe(true);
    expect(layoutBeforePrototype.canvasHeight).toBeGreaterThanOrEqual(180);
    expect(layoutBeforePrototype.detailRailVisible).toBe(true);
    expect(layoutBeforePrototype.operationsScrollsVertically).toBe(true);
    expect(layoutBeforePrototype.chatScrollsVertically).toBe(true);
    expect(layoutBeforePrototype.participantsCanScrollHorizontally).toBe(true);

    await page
      .getByRole("button", {
        name: "Approve Requirement candidate",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: "Confirm approve Requirement candidate",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: /generate prototype/i }).click();
    await expect(
      page
        .frameLocator("iframe[title='Generated prototype preview']")
        .getByRole("heading", { name: /prototype v1/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /add feedback/i }),
    ).toBeVisible();

    const layoutAfterPrototype = await readLayout(page);
    expect(layoutAfterPrototype.prototypeScrollsVertically).toBe(true);
    await assertNoPageScroll(page);
  });
});

async function registerWithFrontendFallback(
  page: Page,
  user: { displayName: string; email: string },
) {
  await page.getByRole("button", { name: /^sign in$/i }).click();
  const authDialog = page.getByRole("dialog", { name: /authentication/i });
  await expect(authDialog).toBeVisible();
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

async function installCodexFakes(
  page: Page,
  options: { delayWorkshopTurn?: () => Promise<void> } = {},
) {
  await page.route("**/api/codex/status", async (route) => {
    await route.fulfill(
      json({
        configured: true,
        model: "gpt-5.5",
        message: "E2E Codex fake is active.",
      }),
    );
  });

  await page.route("**/api/codex/workshop-turn", async (route) => {
    await options.delayWorkshopTurn?.();
    const body = route.request().postDataJSON() as { message?: string };
    const message = body.message ?? "No workshop message supplied.";

    await route.fulfill(
      json({
        turn: {
          facilitatorMessage:
            "I captured this on the canvas. What measurable behavior proves the dashboard solves the problem?",
          artifacts: [
            {
              type: "problem",
              title: "Digital system need",
              content: message,
              createdBy: "facilitator",
              tags: ["e2e"],
            },
            {
              type: "requirement",
              title: "Requirement candidate",
              content: `The future solution should support: ${message}`,
              createdBy: "agent-quality",
              tags: ["e2e", "testability"],
            },
          ],
          participantUpdates: [
            {
              participantId: "agent-quality",
              status: "commenting",
              currentActivity: "Reviewing candidate requirement coverage",
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
        message: "Saved in browser and backed up by the E2E fake.",
      }),
    );
  });
}

async function assertNoPageScroll(page: Page) {
  await page.mouse.wheel(0, 900);
  await expect
    .poll(async () =>
      page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })),
    )
    .toEqual({ x: 0, y: 0 });
}

async function readLayout(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".canvas-pane");
    const detailRail = document.querySelector(".detail-rail");
    const participants = document.querySelector(".participants-strip");

    if (!canvas || !detailRail || !participants) {
      throw new Error("Expected workshop layout regions were not rendered.");
    }

    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const canvasRect = canvas.getBoundingClientRect();
    const detailRailRect = detailRail.getBoundingClientRect();
    const participantsStyle = window.getComputedStyle(participants);

    return {
      canvasVisible:
        canvasRect.left >= 0 &&
        canvasRect.top >= 0 &&
        canvasRect.right <= viewport.width &&
        canvasRect.bottom <= viewport.height,
      detailRailVisible:
        detailRailRect.left >= 0 &&
        detailRailRect.top >= 0 &&
        detailRailRect.right <= viewport.width &&
        detailRailRect.bottom <= viewport.height,
      participantsCanScrollHorizontally:
        participantsStyle.overflowX === "auto" &&
        participants.scrollWidth > participants.clientWidth,
      canvasHeight: canvasRect.height,
      operationsScrollsVertically:
        window.getComputedStyle(document.querySelector(".operations-pane")!)
          .overflowY === "auto" &&
        document.querySelector(".operations-pane")!.scrollHeight >
          document.querySelector(".operations-pane")!.clientHeight,
      chatScrollsVertically:
        window.getComputedStyle(document.querySelector(".message-list")!)
          .overflowY === "auto" &&
        document.querySelector(".message-list")!.scrollHeight >
          document.querySelector(".message-list")!.clientHeight,
      prototypeScrollsVertically:
        window.getComputedStyle(document.querySelector(".prototype-pane")!)
          .overflowY === "auto" &&
        document.querySelector(".prototype-pane")!.scrollHeight >
          document.querySelector(".prototype-pane")!.clientHeight,
    };
  });
}

function json(body: unknown): Parameters<Route["fulfill"]>[0] {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}
