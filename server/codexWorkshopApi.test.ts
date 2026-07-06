import { describe, expect, it, vi } from "vitest";
import {
  codexApiKey,
  codexStatusPayload,
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

      expect(requestBody.model).toBe("gpt-5.5");
      expect(requestBody.store).toBe(false);
      expect(requestBody.input).toContain("Connected alarm dashboard");
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
          session: { messages: [] },
        },
        fetchImpl,
      ),
    ).resolves.toMatchObject({
      facilitatorMessage:
        "Jag har fångat problemet. Vilken användargrupp prioriterar vi först?",
      artifacts: [{ title: "Larmöversikt" }],
    });
  });
});
