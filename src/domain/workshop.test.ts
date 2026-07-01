import { describe, expect, it } from "vitest";
import {
  createInitialWorkshopSession,
  generateWorkshopReport,
  renderReportMarkdown,
  setFollowDiscussion,
  submitHumanMessage,
  updateArtifactStatus,
} from "./workshop";

describe("workshop domain", () => {
  it("starts with a facilitator welcome and traceable canvas artifacts", () => {
    const session = createInitialWorkshopSession("2026-07-01T10:00:00.000Z");

    expect(session.messages[0]?.kind).toBe("welcome");
    expect(session.artifacts.map((artifact) => artifact.type)).toEqual([
      "goal",
      "question",
    ]);
    expect(session.links[0]).toMatchObject({
      sourceArtifactId: "artifact-workshop-goal",
      targetArtifactId: "artifact-open-question",
    });
  });

  it("turns a human contribution into canvas artifacts and one facilitator question", () => {
    const session = createInitialWorkshopSession("2026-07-01T10:00:00.000Z");
    const next = submitHumanMessage(
      session,
      "SOS operators need an AI tool that should summarize incident data from other systems and flag risk.",
      "2026-07-01T10:01:00.000Z",
    );

    expect(
      next.messages.some((message) => message.kind === "human-input"),
    ).toBe(true);
    expect(
      next.messages.filter((message) => message.kind === "agent-suggestion"),
    ).toHaveLength(0);
    expect(
      next.messages.filter(
        (message) => message.kind === "facilitator-guidance",
      ),
    ).toHaveLength(1);
    expect(next.messages.at(-1)?.body).toContain("Next question:");
    expect(
      next.artifacts.some((artifact) => artifact.type === "requirement"),
    ).toBe(true);
    expect(next.artifacts.some((artifact) => artifact.type === "risk")).toBe(
      true,
    );
    expect(
      next.artifacts.every((artifact) => artifact.source.participantId),
    ).toBe(true);
  });

  it("captures all V1 specialist perspectives as canvas artifacts", () => {
    const next = submitHumanMessage(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "A user journey for SOS operators needs a system integration and data flow that should improve service value, create a decision rule, and flag security risk.",
      "2026-07-01T10:01:00.000Z",
    );

    const specialistIds = next.artifacts
      .filter((artifact) => artifact.createdBy.startsWith("agent-"))
      .map((artifact) => artifact.createdBy);

    expect(specialistIds).toEqual(
      expect.arrayContaining([
        "agent-business",
        "agent-ux",
        "agent-risk",
        "agent-technical",
        "agent-quality",
      ]),
    );
    expect(next.artifacts.map((artifact) => artifact.type)).toEqual(
      expect.arrayContaining([
        "problem",
        "actor",
        "requirement",
        "flow-step",
        "decision",
        "risk",
        "assumption",
        "question",
        "goal",
      ]),
    );
  });

  it("answers in Swedish when the human writes in Swedish", () => {
    const next = submitHumanMessage(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "Vi behöver bygga ett system som övervakar kunders larm och visar data i en dashboard.",
      "2026-07-01T10:01:00.000Z",
    );

    expect(next.messages.at(-1)?.body).toContain("Nästa fråga:");
    expect(next.messages.at(-1)?.body).toContain("Vilka användare");
    expect(
      next.artifacts.some((artifact) => artifact.title === "Kravkandidat"),
    ).toBe(true);
    expect(
      next.artifacts.some(
        (artifact) => artifact.title === "Integrationsantagande",
      ),
    ).toBe(true);
  });

  it("ignores blank human input without mutating the session", () => {
    const session = createInitialWorkshopSession("2026-07-01T10:00:00.000Z");

    const next = submitHumanMessage(
      session,
      "   \n\t   ",
      "2026-07-01T10:01:00.000Z",
    );

    expect(next).toBe(session);
  });

  it("keeps the selected artifact stable when follow discussion is disabled", () => {
    const session = setFollowDiscussion(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      false,
    );

    const next = submitHumanMessage(
      session,
      "A handler needs a system that should compare intake data and show missing handover details.",
      "2026-07-01T10:01:00.000Z",
    );

    expect(next.artifacts.length).toBeGreaterThan(session.artifacts.length);
    expect(next.selectedArtifactId).toBe(session.selectedArtifactId);
  });

  it("renders a report from accepted artifacts while keeping unresolved material visible", () => {
    const session = submitHumanMessage(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "A case handler needs a system that should show all missing requirements before handover.",
      "2026-07-01T10:01:00.000Z",
    );
    const requirement = session.artifacts.find(
      (artifact) => artifact.type === "requirement",
    );
    expect(requirement).toBeDefined();

    const accepted = updateArtifactStatus(
      session,
      requirement?.id ?? "",
      "accepted",
      "2026-07-01T10:02:00.000Z",
    );
    const report = generateWorkshopReport(accepted, "2026-07-01T10:03:00.000Z");
    const markdown = renderReportMarkdown(report);

    expect(
      report.sections.some((section) => section.id === "requirements"),
    ).toBe(true);
    expect(report.unresolved.length).toBeGreaterThan(0);
    expect(markdown).toContain("Requirement Candidates");
    expect(markdown).toContain("Unresolved Workshop Material");
  });
});
