import { describe, expect, it, vi } from "vitest";
import {
  codexApiKey,
  codexStatusPayload,
  createServerSafeWorkshopPayload,
  createCodexWorkshopTurn,
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
      const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
        model?: string;
        store?: boolean;
        input?: string;
      };
      const input = JSON.parse(String(requestBody.input)) as {
        latestHumanMessage?: string;
        session?: { recentMessages?: unknown[]; secretDebugState?: unknown };
      };

      expect(requestBody.model).toBe("gpt-5.5");
      expect(requestBody.store).toBe(false);
      expect(requestBody.input).toContain("Connected alarm dashboard");
      expect(input.session?.recentMessages).toHaveLength(1);
      expect(input.session).not.toHaveProperty("secretDebugState");
      expect(String(init?.headers)).not.toContain("test-api-key");

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
        {
          name: "secrets.txt",
          mimeType: "text/plain",
          size: 64,
          status: "extracted",
          summary: "Bearer abcdefghijklmnopqrstuvwxyz",
          extractedText: "sk-abcdefghijklmnopqrstuvwxyz123456 ".repeat(400),
          tags: ["attachment", "secret", "extra"],
          rawBytes: "must-not-pass",
        },
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
      },
    });
    const serialized = JSON.stringify(safePayload);

    expect(safePayload.session.recentMessages).toHaveLength(8);
    expect(safePayload.session.artifacts).toHaveLength(24);
    expect(
      safePayload.newAttachments[0]?.extractedText.length,
    ).toBeLessThanOrEqual(6000);
    expect(serialized).not.toContain("secretDebugState");
    expect(serialized).not.toContain("rawBytes");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("supersecret");
    expect(serialized).not.toContain("ops@example.com");
    expect(serialized).toContain("[REDACTED:");
  });
});
