import { describe, expect, it } from "vitest";
import { applyCodexWorkshopTurn } from "./codexWorkshop";
import { createInitialWorkshopSession } from "./workshop";

describe("Codex workshop turn", () => {
  it("applies a Codex turn as human input, facilitator guidance, and canvas artifacts", () => {
    const session = createInitialWorkshopSession("2026-07-01T10:00:00.000Z");

    const next = applyCodexWorkshopTurn(
      session,
      "Vi behöver ett dashboard för SOS Alarms larmövervakning.",
      {
        facilitatorMessage:
          "Jag har fångat behovet på canvasen. Vilka användare ska dashboarden hjälpa först?",
        artifacts: [
          {
            type: "problem",
            title: "Behov av larmdashboard",
            content:
              "SOS Alarm behöver en dashboard för övervakning av kunders larmsystem.",
            createdBy: "facilitator",
            tags: ["problem"],
          },
          {
            type: "requirement",
            title: "Översikt över larmsystem",
            content:
              "Dashboarden ska visa en samlad översikt över alla kunders larmsystem.",
            createdBy: "agent-quality",
            tags: ["krav"],
          },
        ],
      },
      [],
      "2026-07-01T10:01:00.000Z",
    );

    expect(next.messages).toHaveLength(3);
    expect(next.messages[1]?.kind).toBe("human-input");
    expect(next.messages[2]?.body).toContain("Vilka användare");
    expect(next.artifacts).toHaveLength(2);
    expect(next.artifacts[1]?.createdBy).toBe("agent-quality");
    expect(next.artifacts[1]?.tags).toContain("codex");
    expect(next.selectedArtifactId).toBe(next.artifacts[1]?.id);
  });

  it("normalizes invalid Codex artifact fields before persisting state", () => {
    const next = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "A system is needed.",
      {
        facilitatorMessage: "What should we clarify first?",
        artifacts: [
          {
            type: "requirement",
            title: "Valid requirement",
            content: "The system should show active alarms.",
            createdBy: "unknown-agent",
          },
          {
            type: "risk",
            title: "   ",
            content: "Ignored because the title is blank.",
            createdBy: "agent-risk",
          },
        ],
      },
      [],
      "2026-07-01T10:01:00.000Z",
    );

    expect(next.artifacts).toHaveLength(1);
    expect(next.artifacts[0]?.createdBy).toBe("facilitator");
    expect(next.artifacts[0]?.status).toBe("draft");
  });

  it("creates source artifacts for attachments before Codex artifacts", () => {
    const next = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "Use this preparatory work.",
      {
        facilitatorMessage:
          "I added the attached source to the canvas. Which part should we validate first?",
        artifacts: [
          {
            type: "question",
            title: "Validate source",
            content: "Which rows are still current?",
            createdBy: "agent-quality",
          },
        ],
      },
      [
        {
          name: "requirements.csv",
          mimeType: "text/csv",
          size: 42,
          extractedText: "id,title\n1,Alarm dashboard",
          summary: "id,title 1,Alarm dashboard",
          status: "extracted",
          tags: ["attachment", "file:csv"],
        },
      ],
      "2026-07-01T10:01:00.000Z",
    );

    expect(next.attachments).toHaveLength(1);
    expect(next.artifacts[0]?.type).toBe("source");
    expect(next.artifacts[0]?.title).toBe("requirements.csv");
    expect(next.artifacts[1]?.type).toBe("question");
  });
});
