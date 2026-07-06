import { describe, expect, it } from "vitest";
import {
  auditAttachmentSecurityReview,
  auditRequirementHistory,
  createAuditSummary,
  createProductionWorkshopExport,
} from "./audit";
import { createProductionAttachmentRecord } from "./attachmentSecurity";
import {
  approveRequirement,
  createRequirement,
  reviseRequirement,
} from "./requirements";
import { applyCodexWorkshopTurn } from "./codexWorkshop";
import { createInitialWorkshopSession } from "./workshop";

const organizationId = "org-1";
const workshopId = "workshop-1";
const at = "2026-07-06T09:00:00.000Z";

describe("audit domain", () => {
  it("maps requirement version history to deterministic append-only audit events", () => {
    const requirement = createRequirement({
      id: "requirement-1",
      title: "Alarm dashboard",
      statement: "The dashboard should show active alarms.",
      state: "candidate",
      createdAt: at,
      createdBy: "agent-quality",
      acceptanceCriteria: ["Active alarms are visible."],
      sourceRefs: [{ messageId: "message-1", participantId: "human-1" }],
      rationale: "Derived from workshop discussion.",
    });
    const revised = reviseRequirement(
      requirement,
      {
        statement: "The dashboard should show active alarms within 60 seconds.",
      },
      {
        actorId: "agent-quality",
        at: "2026-07-06T09:05:00.000Z",
        rationale: "Added measurable freshness target.",
      },
    );
    const approved = approveRequirement(revised, {
      actorId: "user-owner",
      at: "2026-07-06T09:10:00.000Z",
      rationale: "Owner accepted the requirement.",
    });

    const events = auditRequirementHistory(approved, {
      organizationId,
      workshopId,
    });

    expect(events.map((event) => event.id)).toEqual([
      "workshop-1:audit-0001",
      "workshop-1:audit-0002",
      "workshop-1:audit-0003",
    ]);
    expect(events.map((event) => event.action)).toEqual([
      "requirement.created",
      "requirement.edited",
      "requirement.approved",
    ]);
    expect(events[2]).toMatchObject({
      actorId: "user-owner",
      category: "requirement",
      target: {
        type: "requirement",
        id: "requirement-1",
      },
      metadata: {
        toState: "approved",
        version: 3,
      },
    });
    expect(createAuditSummary(events)).toMatchObject({
      eventCount: 3,
      latestEventAt: "2026-07-06T09:10:00.000Z",
      byCategory: [{ category: "requirement", count: 3 }],
    });
  });

  it("creates attachment security audit events", () => {
    const attachment = createProductionAttachmentRecord({
      draft: {
        name: "requirements.csv",
        mimeType: "text/csv",
        size: 64,
        extractedText: "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
        summary: "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
        status: "extracted",
        tags: ["attachment", "file:csv"],
      },
      id: "attachment-001",
      organizationId,
      workshopId,
      sourceMessageId: "message-1",
      uploadedByUserId: "user-owner",
      createdAt: at,
    });

    const event = auditAttachmentSecurityReview(attachment, {
      organizationId,
      workshopId,
      sequence: 4,
    });

    expect(event).toMatchObject({
      id: "workshop-1:audit-0004",
      category: "attachment",
      action: "attachment.reviewed",
      metadata: {
        scanStatus: "needs-review",
        storageProvider: "local-browser",
      },
    });
  });

  it("renders deterministic sanitized production exports from saved state", () => {
    const session = applyCodexWorkshopTurn(
      createInitialWorkshopSession("2026-07-06T09:00:00.000Z", workshopId),
      "Prepare operational dashboard requirements.",
      {
        facilitatorMessage:
          "I captured the operational sources. Which decision should be approved first?",
        artifacts: [
          {
            type: "decision",
            title: "Use active-alarm source",
            content: "Use the active alarm table as the first source.",
            createdBy: "facilitator",
          },
          {
            type: "risk",
            title: "Sensitive extract",
            content:
              "An imported file may include api_key=sk-abcdefghijklmnopqrstuvwxyz123456.",
            createdBy: "agent-risk",
          },
          {
            type: "question",
            title: "Retention",
            content: "How long should attachment extracts be retained?",
            createdBy: "agent-risk",
          },
        ],
      },
      [
        {
          name: "source.csv",
          mimeType: "text/csv",
          size: 80,
          extractedText: "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
          summary: "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
          status: "extracted",
          tags: ["attachment", "file:csv"],
        },
      ],
      "2026-07-06T09:01:00.000Z",
    );
    const approved = approveRequirement(
      createRequirement({
        id: "requirement-1",
        title: "Alarm dashboard",
        statement:
          "The dashboard should hide api_key=sk-abcdefghijklmnopqrstuvwxyz123456 from users.",
        state: "candidate",
        createdAt: at,
        createdBy: "agent-quality",
        acceptanceCriteria: ["Secrets are not rendered in the UI."],
        sourceRefs: [{ messageId: "message-2", participantId: "human-1" }],
        rationale: "Derived from attachment review.",
      }),
      {
        actorId: "user-owner",
        at: "2026-07-06T09:10:00.000Z",
        rationale: "Owner accepted the requirement.",
      },
    );
    const auditEvents = auditRequirementHistory(approved, {
      organizationId,
      workshopId,
    });

    const first = createProductionWorkshopExport({
      session,
      requirements: [approved],
      auditEvents,
      organizationId,
      workshopId,
      generatedAt: "2026-07-06T09:30:00.000Z",
    });
    const second = createProductionWorkshopExport({
      session,
      requirements: [approved],
      auditEvents,
      organizationId,
      workshopId,
      generatedAt: "2026-07-06T09:30:00.000Z",
    });

    expect(second).toEqual(first);
    expect(first.report.approvedRequirements).toHaveLength(1);
    expect(first.report.decisions).toHaveLength(1);
    expect(first.report.risks).toHaveLength(1);
    expect(first.report.openQuestions).toHaveLength(1);
    expect(first.report.traceability.nodeCount).toBeGreaterThan(0);
    expect(first.report.auditSummary.eventCount).toBe(2);
    expect(first.report.attachments[0]).not.toHaveProperty("extractedText");
    expect(first.report.redactions.map((finding) => finding.kind)).toContain(
      "openai-api-key",
    );
    expect(JSON.stringify(first)).not.toContain(
      "sk-abcdefghijklmnopqrstuvwxyz",
    );
  });
});
