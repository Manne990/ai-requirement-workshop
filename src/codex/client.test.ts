import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOrganization,
  emptyOrganizationState,
} from "../domain/organization";
import { createInitialWorkshopSession } from "../domain/workshop";
import { requestCodexWorkshopTurn } from "./client";

describe("codex client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends organization and workshop scope after local access validation", async () => {
    const organizationState = createOrganization(
      emptyOrganizationState,
      {
        id: "org-1",
        name: "Operations",
        ownerUserId: "user-owner",
      },
      "2026-07-06T09:00:00.000Z",
    );
    const session = createInitialWorkshopSession(
      "2026-07-06T09:00:00.000Z",
      "workshop-1",
    );
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          message?: string;
          scope?: {
            organizationId?: string;
            workshopId?: string;
            actorUserId?: string;
          };
        };
        const serialized = JSON.stringify(body);

        expect(body.scope).toEqual({
          organizationId: "org-1",
          workshopId: "workshop-1",
          actorUserId: "user-owner",
        });
        expect(serialized).not.toContain("hunter2");
        expect(serialized).toContain("[REDACTED:credential]");

        return new Response(
          JSON.stringify({
            turn: {
              facilitatorMessage:
                "Jag har sparat detta. Vilket beteende ska verifieras först?",
              artifacts: [],
              participantUpdates: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    ) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestCodexWorkshopTurn(
        session,
        "Use password=hunter2 for the alarm dashboard.",
        [],
        {
          organizationState,
          organizationId: "org-1",
          actorUserId: "user-owner",
        },
      ),
    ).resolves.toMatchObject({
      facilitatorMessage:
        "Jag har sparat detta. Vilket beteende ska verifieras först?",
    });
  });

  it("does not call the Codex endpoint when organization access is denied", async () => {
    const organizationState = createOrganization(
      emptyOrganizationState,
      {
        id: "org-1",
        name: "Operations",
        ownerUserId: "user-owner",
      },
      "2026-07-06T09:00:00.000Z",
    );
    const session = createInitialWorkshopSession(
      "2026-07-06T09:00:00.000Z",
      "workshop-1",
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestCodexWorkshopTurn(session, "Continue.", [], {
        organizationState,
        organizationId: "org-1",
        actorUserId: "user-outsider",
      }),
    ).rejects.toThrow("AI prompt construction denied: membership-missing.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
