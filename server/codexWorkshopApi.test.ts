import { describe, expect, it, vi } from "vitest";
import {
  codexApiKey,
  codexStatusPayload,
  createServerSafeWorkshopPayload,
  createCodexWorkshopTurn,
  isUnauthenticatedCodexWorkshopApiEnabled,
  parseCodexTurn,
} from "./codexWorkshopApi.js";

describe("codexWorkshopApi", () => {
  it("reports configured status without exposing the token", () => {
    const status = codexStatusPayload({ OPENAI_API_KEY: "secret-token" });

    expect(status).toMatchObject({
      configured: true,
      model: "gpt-5.5",
    });
    expect(JSON.stringify(status)).not.toContain("secret-token");
    expect(codexApiKey({ CODEX_API_TOKEN: "alias-token" })).toBe("alias-token");
  });

  it("fails closed for unauthenticated Codex turns in production unless explicitly enabled", () => {
    expect(isUnauthenticatedCodexWorkshopApiEnabled({ NODE_ENV: "test" })).toBe(
      true,
    );
    expect(
      isUnauthenticatedCodexWorkshopApiEnabled({ NODE_ENV: "production" }),
    ).toBe(false);
    expect(
      isUnauthenticatedCodexWorkshopApiEnabled({
        VERCEL_ENV: "production",
        AI_REQUIREMENT_WORKSHOP_ALLOW_UNAUTHENTICATED_CODEX_API: "true",
      }),
    ).toBe(true);
  });

  it("parses JSON even when a model wraps the object in explanatory text", () => {
    expect(
      parseCodexTurn(`
        Here is the JSON:
        {
          "facilitatorMessage": "Vilket beteende ska verifieras först?",
          "artifacts": [{"type": "question", "title": "Verifiering", "content": "Vad räknas som klart?", "createdBy": "facilitator"}]
        }
      `),
    ).toMatchObject({
      facilitatorMessage: "Vilket beteende ska verifieras först?",
      artifacts: [{ type: "question", title: "Verifiering" }],
    });
  });

  it("calls OpenAI Responses with a minimized, non-stored workshop payload", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
        model?: string;
        store?: boolean;
        input?: string;
      };
      const input = JSON.parse(String(requestBody.input)) as {
        latestHumanMessage?: string;
        session?: { recentMessages?: unknown[]; secretDebugState?: unknown };
        scope?: {
          organizationId?: string;
          workshopId?: string;
          actorUserId?: string;
        };
      };

      expect(requestBody.model).toBe("gpt-5.5");
      expect(requestBody.store).toBe(false);
      expect(headers.get("Authorization")).toBe("Bearer test-api-key");
      expect(JSON.stringify(requestBody)).not.toContain("test-api-key");
      expect(requestBody.input).toContain("Connected alarm dashboard");
      expect(input.session?.recentMessages).toHaveLength(1);
      expect(input.session).not.toHaveProperty("secretDebugState");
      expect(input.scope).toEqual({
        organizationId: "org-1",
        workshopId: "workshop-1",
      });
      expect(input.scope).not.toHaveProperty("actorUserId");

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            facilitatorMessage:
              "Jag har fångat problemet. Vilken användargrupp prioriterar vi först?",
            artifacts: [
              {
                type: "problem",
                title: "Larmöversikt",
                content: "Connected alarm dashboard",
                createdBy: "facilitator",
              },
            ],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    await expect(
      createCodexWorkshopTurn(
        "test-api-key",
        {
          message: "Connected alarm dashboard",
          session: {
            secretDebugState: "must not leave the server boundary",
            recentMessages: [
              {
                participantId: "human-1",
                kind: "human-input",
                body: "Connected alarm dashboard",
              },
            ],
          },
          scope: {
            organizationId: "org-1",
            workshopId: "workshop-1",
            actorUserId: "user-owner",
          },
        },
        fetchImpl,
      ),
    ).resolves.toMatchObject({
      facilitatorMessage:
        "Jag har fångat problemet. Vilken användargrupp prioriterar vi först?",
      artifacts: [{ title: "Larmöversikt" }],
    });
  });

  it("minimizes and redacts inbound workshop payload again on the server boundary", () => {
    const safePayload = createServerSafeWorkshopPayload({
      message: "Use api_key=supersecret before calling ops@example.com.",
      attachments: [
        ...Array.from({ length: 13 }, (_, index) => ({
          name: "secrets.txt",
          mimeType: "text/plain",
          size: 64,
          status: "extracted",
          summary:
            index === 0
              ? "Bearer abcdefghijklmnopqrstuvwxyz"
              : `Summary ${index}`,
          extractedText:
            index === 0
              ? "api_key=sk-abcdefghijklmnopqrstuvwxyz123456 ".repeat(400)
              : `Extract ${index}`,
          tags:
            index === 0
              ? [
                  "attachment",
                  "token=abcdefghijklmnopqrstuvwxyz",
                  "tag-2",
                  "tag-3",
                  "tag-4",
                  "tag-5",
                  "tag-6",
                  "tag-7",
                  "tag-8",
                ]
              : ["attachment"],
          rawBytes: "must-not-pass",
          storage: {
            objectPath: "organizations/org-1/workshops/workshop-1/raw.txt",
          },
        })),
      ],
      session: {
        title: "Security review",
        secretDebugState: "must-not-pass",
        recentMessages: Array.from({ length: 10 }, (_, index) => ({
          participantId: "human-1",
          kind: "human-input",
          body: `Message ${index} password=hunter2`,
        })),
        artifacts: Array.from({ length: 30 }, (_, index) => ({
          id: `artifact-${index}`,
          type: "requirement",
          title: `Requirement ${index}`,
          content: `Content ${index}`,
          status: "draft",
          createdBy: "agent-quality",
          tags: ["requirement"],
        })),
        attachments: [
          {
            name: "historical.txt",
            mimeType: "text/plain",
            size: 64,
            status: "extracted",
            summary: "19800101-1234",
            extractedText: "ops@example.com",
            tags: ["token=abcdefghijklmnopqrstuvwxyz"],
            storage: {
              objectPath: "organizations/org-1/workshops/workshop-1/raw.txt",
            },
          },
        ],
      },
      scope: {
        organizationId: "org-1",
        workshopId: "workshop-1",
        actorUserId: "user-owner",
      },
    });
    const serialized = JSON.stringify(safePayload);

    expect(safePayload.newAttachments).toHaveLength(12);
    expect(safePayload.session.recentMessages).toHaveLength(8);
    expect(safePayload.session.artifacts).toHaveLength(24);
    expect(safePayload.scope).toEqual({
      organizationId: "org-1",
      workshopId: "workshop-1",
    });
    expect(safePayload.newAttachments[0]?.tags).toHaveLength(8);
    expect(
      safePayload.newAttachments[0]?.extractedText.length,
    ).toBeLessThanOrEqual(6000);
    expect(serialized).not.toContain("secretDebugState");
    expect(serialized).not.toContain("rawBytes");
    expect(serialized).not.toContain("objectPath");
    expect(serialized).not.toContain("user-owner");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("supersecret");
    expect(serialized).not.toContain("ops@example.com");
    expect(serialized).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(serialized).not.toContain("19800101-1234");
    expect(serialized).toContain("[REDACTED:");
  });
});
