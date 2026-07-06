import { describe, expect, it } from "vitest";
import { evaluateWorkshopReadiness } from "./readiness";
import { createInitialWorkshopSession, updateArtifactStatus } from "./workshop";
import { applyCodexWorkshopTurn } from "./codexWorkshop";

describe("workshop readiness", () => {
  it("starts early with observable gaps", () => {
    const readiness = evaluateWorkshopReadiness(
      createInitialWorkshopSession("2026-07-03T08:00:00.000Z"),
    );

    expect(readiness.level).toBe("early");
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        "Problem framed is missing.",
        "Primary actors identified is missing.",
      ]),
    );
  });

  it("moves toward ready as artifacts are accepted and risks are handled", () => {
    const session = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-03T08:00:00.000Z"),
      "SOS needs a dashboard for alarm monitoring.",
      {
        facilitatorMessage: "What data freshness is needed?",
        artifacts: [
          {
            type: "problem",
            title: "Alarm monitoring dashboard",
            content: "SOS needs a dashboard for alarm monitoring.",
            createdBy: "facilitator",
          },
          {
            type: "actor",
            title: "Monitoring staff",
            content: "Internal staff are the first users.",
            createdBy: "agent-ux",
          },
          {
            type: "requirement",
            title: "Customer overview",
            content:
              "Monitoring staff should show all customer alarm systems within 2 seconds. Acceptance criteria: Given the overview loads, then every active customer alarm system is visible. Security logging records access.",
            createdBy: "agent-quality",
          },
          {
            type: "requirement",
            title: "Customer detail",
            content:
              "Monitoring staff should show one customer's devices and statuses within 2 seconds. Acceptance criteria: Given a customer is selected, then current device status is visible. Data freshness is displayed.",
            createdBy: "agent-quality",
          },
          {
            type: "risk",
            title: "Stale data",
            content: "Old 4G data can mislead staff.",
            createdBy: "agent-risk",
          },
        ],
      },
      [],
      "2026-07-03T08:01:00.000Z",
    );

    const accepted = session.artifacts.reduce(
      (current, artifact) =>
        updateArtifactStatus(
          current,
          artifact.id,
          artifact.type === "risk" ? "parked" : "accepted",
          "2026-07-03T08:02:00.000Z",
        ),
      session,
    );

    const readiness = evaluateWorkshopReadiness(accepted);

    expect(readiness.score).toBeGreaterThanOrEqual(84);
    expect(readiness.level).toBe("ready");
  });

  it("keeps readiness below ready when accepted requirements have quality blockers", () => {
    const session = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-03T08:00:00.000Z"),
      "SOS needs a dashboard for alarm monitoring.",
      {
        facilitatorMessage: "What data freshness is needed?",
        artifacts: [
          {
            type: "problem",
            title: "Alarm monitoring dashboard",
            content: "SOS needs a dashboard for alarm monitoring.",
            createdBy: "facilitator",
          },
          {
            type: "actor",
            title: "Monitoring staff",
            content: "Internal staff are the first users.",
            createdBy: "agent-ux",
          },
          {
            type: "requirement",
            title: "Customer overview",
            content: "Show all customer alarm systems.",
            createdBy: "agent-quality",
          },
          {
            type: "risk",
            title: "Stale data",
            content: "Old 4G data can mislead staff.",
            createdBy: "agent-risk",
          },
        ],
      },
      [],
      "2026-07-03T08:01:00.000Z",
    );

    const accepted = session.artifacts.reduce(
      (current, artifact) =>
        updateArtifactStatus(
          current,
          artifact.id,
          artifact.type === "risk" ? "parked" : "accepted",
          "2026-07-03T08:02:00.000Z",
        ),
      session,
    );

    const readiness = evaluateWorkshopReadiness(accepted);

    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "requirement-quality",
          passed: false,
          detail: "1 blocking requirement quality issue need review.",
        }),
      ]),
    );
    expect(readiness.level).not.toBe("ready");
  });
});
