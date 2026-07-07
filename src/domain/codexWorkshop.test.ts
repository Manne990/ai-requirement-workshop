import { describe, expect, it } from "vitest";
import {
  appendPendingCodexHumanMessage,
  applyCodexWorkshopTurn,
  removePendingCodexHumanMessage,
} from "./codexWorkshop";
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
    expect(next.artifacts.length).toBeGreaterThanOrEqual(2);
    expect(next.artifacts[0]?.type).toBe("problem");
    expect(next.artifacts[1]?.createdBy).toBe("agent-quality");
    expect(next.artifacts[1]?.tags).toContain("codex");
    expect(
      next.artifacts.some((artifact) =>
        artifact.tags.includes("quality-check"),
      ),
    ).toBe(true);
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

    const requirement = next.artifacts.find(
      (artifact) => artifact.type === "requirement",
    );

    expect(requirement?.createdBy).toBe("facilitator");
    expect(requirement?.status).toBe("draft");
  });

  it("drops invalid participant updates before persisting participant state", () => {
    const next = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "A system is needed.",
      {
        facilitatorMessage: "What should we clarify first?",
        artifacts: [],
        participantUpdates: [
          {
            participantId: "agent-risk",
            status: "broken injected",
            currentActivity: "x".repeat(240),
          },
          {
            participantId: "agent-quality",
            status: "concern",
            currentActivity:
              "Checking whether the candidate can be tested. ".repeat(10),
          },
        ] as never,
      },
      [],
      "2026-07-01T10:01:00.000Z",
    );

    const risk = next.participants.find(
      (participant) => participant.id === "agent-risk",
    );
    const quality = next.participants.find(
      (participant) => participant.id === "agent-quality",
    );

    expect(risk).toMatchObject({
      status: "listening",
      currentActivity: "Listening for relevant signals",
    });
    expect(quality?.status).toBe("concern");
    expect(quality?.currentActivity.length).toBeLessThanOrEqual(160);
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

  it("adds scoped production attachment provenance when organization context is available", () => {
    const next = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z", "workshop-1"),
      "Use this preparatory work.",
      {
        facilitatorMessage:
          "I added the attached source to the canvas. Which part should we validate first?",
        artifacts: [],
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
      {
        attachmentContext: {
          organizationId: "org-1",
          workshopId: "workshop-1",
          uploadedByUserId: "user-owner",
        },
      },
    );
    const [attachment] = next.attachments as Array<{
      organizationId?: string;
      workshopId?: string;
      uploadedByUserId?: string;
      provenance?: {
        organizationId?: string;
        workshopId?: string;
        sourceMessageId?: string;
        uploadedByUserId?: string;
      };
      storage?: { provider?: string; status?: string; objectPath?: string };
      securityReview?: { status?: string; safeForAi?: boolean };
    }>;

    expect(attachment).toMatchObject({
      organizationId: "org-1",
      workshopId: "workshop-1",
      uploadedByUserId: "user-owner",
      provenance: {
        organizationId: "org-1",
        workshopId: "workshop-1",
        sourceMessageId: "message-002",
        uploadedByUserId: "user-owner",
      },
      storage: {
        provider: "local-browser",
        status: "metadata-only",
      },
      securityReview: {
        status: "accepted",
        safeForAi: true,
      },
    });
    expect(attachment?.storage).not.toHaveProperty("objectPath");
    expect(next.artifacts[0]?.tags).toEqual(
      expect.arrayContaining(["security:accepted", "storage:metadata-only"]),
    );
  });

  it("adds deterministic quality question artifacts for weak requirement drafts", () => {
    const next = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "The support team needs a portal.",
      {
        facilitatorMessage: "I captured that. What should we verify first?",
        artifacts: [
          {
            type: "requirement",
            title: "Better support portal",
            content:
              "The portal should be easy to use and improve support outcomes.",
            createdBy: "agent-quality",
          },
        ],
      },
      [],
      "2026-07-01T10:01:00.000Z",
    );

    const qualityKinds = next.artifacts
      .filter((artifact) => artifact.tags.includes("quality-check"))
      .flatMap((artifact) => artifact.tags);

    expect(qualityKinds).toEqual(
      expect.arrayContaining([
        "quality:ambiguity",
        "quality:missing-acceptance-criteria",
        "quality:unverifiable-claim",
        "quality:missing-non-functional-concern",
      ]),
    );
  });

  it("uses a quality question when Codex facilitator guidance lacks one", () => {
    const next = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "The support team needs a portal.",
      {
        facilitatorMessage: "Captured the requirement on the canvas.",
        artifacts: [
          {
            type: "requirement",
            title: "Support portal",
            content: "The portal should improve support outcomes.",
            createdBy: "agent-quality",
          },
        ],
      },
      [],
      "2026-07-01T10:01:00.000Z",
    );

    const facilitatorBody = next.messages.at(-1)?.body ?? "";

    expect(facilitatorBody).toContain(
      "What acceptance criterion would let the team approve this requirement?",
    );
    expect(questionCount(facilitatorBody)).toBe(1);
  });

  it("keeps facilitator guidance to one calm question in the user's language", () => {
    const next = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "Vi behöver en portal för supportteamet.",
      {
        facilitatorMessage:
          "Great! What users need this first? What metric matters?",
        artifacts: [
          {
            type: "problem",
            title: "Supportportal",
            content: "Supportteamet behöver en portal.",
            createdBy: "facilitator",
          },
        ],
      },
      [],
      "2026-07-01T10:01:00.000Z",
    );

    const facilitatorBody = next.messages.at(-1)?.body ?? "";

    expect(facilitatorBody).toContain("Jag har fångat");
    expect(facilitatorBody).toContain("Vilken detalj");
    expect(facilitatorBody).not.toContain("!");
    expect(questionCount(facilitatorBody)).toBe(1);
  });

  it("detects Swedish from no-diacritic human input instead of model output", () => {
    const next = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "Vi vill bygga stod for felanmalan och krav.",
      {
        facilitatorMessage:
          "Great. Which user journey should we inspect first?",
        artifacts: [],
      },
      [],
      "2026-07-01T10:01:00.000Z",
    );

    expect(next.messages.at(-1)?.body).toContain("Jag har fångat");
  });

  it("removes a pending human message when a Codex turn fails before becoming canonical", () => {
    const session = createInitialWorkshopSession("2026-07-01T10:00:00.000Z");
    const pending = appendPendingCodexHumanMessage(
      session,
      "A workshop owner needs a dashboard.",
      [],
      "2026-07-01T10:01:00.000Z",
    );

    expect(pending.messages).toHaveLength(session.messages.length + 1);

    const cleaned = removePendingCodexHumanMessage(
      pending,
      "A workshop owner needs a dashboard.",
      [],
      "2026-07-01T10:02:00.000Z",
    );

    expect(cleaned.messages).toEqual(session.messages);
    expect(cleaned.updatedAt).toBe("2026-07-01T10:02:00.000Z");
  });

  it("uses the existing workshop language for attachment-only turns", () => {
    const swedishSession = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "Vi behöver förstå larmsystemets datakällor.",
      {
        facilitatorMessage:
          "Jag har fångat detta. Vilken datakälla ska vi börja med?",
        artifacts: [],
      },
      [],
      "2026-07-01T10:01:00.000Z",
    );

    const next = applyCodexWorkshopTurn(
      swedishSession,
      "",
      {
        facilitatorMessage:
          "Jag har fångat filen. Vilken del ska vi verifiera först?",
        artifacts: [],
      },
      [
        {
          name: "forarbete.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: 128,
          extractedText: "Förarbete om larmdashboard.",
          summary: "Förarbete om larmdashboard.",
          status: "extracted",
          tags: ["attachment"],
        },
      ],
      "2026-07-01T10:02:00.000Z",
    );

    expect(next.messages.at(-2)?.body).toBe(
      "Bifogade filer för workshopgranskning: forarbete.docx",
    );
    expect(next.messages.at(-1)?.body).toContain("Vilken del");
  });

  it("keeps only one active draft question per turn and parks additional questions", () => {
    const next = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "A release team needs a dashboard that should improve response quality.",
      {
        facilitatorMessage: "What should we clarify first?",
        artifacts: [
          {
            type: "question",
            title: "Primary question",
            content: "Which response quality metric matters most?",
            createdBy: "agent-quality",
          },
          {
            type: "question",
            title: "Secondary question",
            content: "Which team owns the metric?",
            createdBy: "agent-business",
          },
          {
            type: "requirement",
            title: "Response quality dashboard",
            content:
              "The dashboard should improve response quality for release teams.",
            createdBy: "agent-quality",
          },
        ],
      },
      [],
      "2026-07-01T10:01:00.000Z",
    );

    const questions = next.artifacts.filter(
      (artifact) => artifact.type === "question",
    );

    expect(
      questions.filter((artifact) => artifact.status === "draft"),
    ).toHaveLength(1);
    expect(
      questions.filter((artifact) => artifact.status === "parked").length,
    ).toBeGreaterThanOrEqual(1);
    expect(next.messages.at(-1)?.relatedArtifactIds).toHaveLength(1);
  });
});

function questionCount(body: string) {
  return body.split("?").length - 1;
}
