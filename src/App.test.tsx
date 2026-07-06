import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import {
  createInitialWorkshopSession,
  submitHumanMessage,
  updateArtifactStatus,
  type WorkshopSession,
} from "./domain/workshop";

const storageKey = "ai-requirement-workshop:v1-session";

type RestoreMetadataSession = WorkshopSession & {
  attachmentsMetadata: {
    id: string;
    name: string;
    sourceMessageId: string;
    sizeBytes: number;
    contentType: string;
  }[];
  readinessState: {
    status: string;
    checkedAt: string;
    owner: string;
  };
  backupProvenance: {
    exportId: string;
    exportedAt: string;
    importedAt: string;
    backupFileName: string;
  };
};

function readPersistedSession() {
  const raw = window.localStorage.getItem(storageKey);
  expect(raw).toBeTruthy();
  return JSON.parse(raw ?? "{}") as RestoreMetadataSession;
}

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("runs the basic workshop loop from chat input to report output", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /collaborative requirement room/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/welcome\. describe what digital system/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/describe, challenge, or refine/i), {
      target: {
        value:
          "A dispatcher needs a system that should summarize related incidents, show data source confidence, and flag critical risks.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findAllByText(/requirement candidate/i),
    ).not.toHaveLength(0);
    expect(screen.getByText(/next question/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("button", { name: /requirement candidate/i })[0],
    );
    const selectedPanel = screen.getByLabelText(
      /participants and selected artifact/i,
    );
    fireEvent.click(
      within(selectedPanel).getByRole("button", { name: /accept/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /report/i }));

    const report = screen.getByRole("dialog", { name: /workshop report/i });
    expect(within(report).getByText(/generated output/i)).toBeInTheDocument();
    expect(
      within(report).getByText(/requirement candidates/i),
    ).toBeInTheDocument();
  });

  it("restores an in-progress workshop from local storage after remount", async () => {
    const { unmount } = render(<App />);

    fireEvent.change(screen.getByLabelText(/describe, challenge, or refine/i), {
      target: {
        value:
          "A coordinator needs a system that should track cross-agency handover gaps before dispatch review.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findAllByText(/cross-agency handover/i),
    ).not.toHaveLength(0);

    unmount();
    render(<App />);

    expect(screen.getAllByText(/cross-agency handover/i)).not.toHaveLength(0);
    expect(screen.getAllByText(/requirement candidate/i)).not.toHaveLength(0);
  });

  it("preserves restore metadata when a workshop backup is reopened and saved", async () => {
    const session = submitHumanMessage(
      createInitialWorkshopSession("2026-07-01T10:00:00.000Z"),
      "A case coordinator needs a system that should preserve attachment metadata, readiness state, and backup provenance across restore.",
      "2026-07-01T10:05:00.000Z",
    );
    const requirement = session.artifacts.find(
      (artifact) => artifact.type === "requirement",
    );

    if (!requirement) {
      throw new Error(
        "Expected a requirement artifact in the restored fixture",
      );
    }

    const acceptedSession = updateArtifactStatus(
      session,
      requirement.id,
      "accepted",
      "2026-07-01T10:06:00.000Z",
    );
    const savedSession: RestoreMetadataSession = {
      ...acceptedSession,
      id: "workshop-session-v1-citizen-services",
      title: "Citizen services restore workshop",
      selectedArtifactId: requirement.id,
      visualizationMode: "risks",
      followDiscussion: false,
      attachmentsMetadata: [
        {
          id: "attachment-1",
          name: "handover-notes.pdf",
          sourceMessageId: "message-2",
          sizeBytes: 28416,
          contentType: "application/pdf",
        },
      ],
      readinessState: {
        status: "ready-for-follow-up",
        checkedAt: "2026-07-01T10:07:00.000Z",
        owner: "Workshop owner",
      },
      backupProvenance: {
        exportId: "export-20260701-1008",
        exportedAt: "2026-07-01T10:08:00.000Z",
        importedAt: "2026-07-01T10:09:00.000Z",
        backupFileName: "citizen-services-export.json",
      },
    };
    const expectedBackupProvenance = {
      ...savedSession.backupProvenance,
      backupFileName: "citizen-services-restore.backup.json",
    };
    const exportedRecord = JSON.stringify(savedSession);
    const importedRecord = JSON.parse(exportedRecord) as RestoreMetadataSession;
    const backupRecord = JSON.stringify({
      ...importedRecord,
      backupProvenance: expectedBackupProvenance,
    });

    window.localStorage.setItem(storageKey, backupRecord);

    render(<App />);

    const detailRail = screen.getByLabelText(
      /participants and selected artifact/i,
    );
    expect(
      within(detailRail).getByRole("heading", {
        name: requirement.title,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Risks" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /follow/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(within(detailRail).getByRole("button", { name: /park/i }));

    await waitFor(() => {
      const persisted = readPersistedSession();
      expect(
        persisted.artifacts.find((artifact) => artifact.id === requirement.id)
          ?.status,
      ).toBe("parked");
    });

    const persisted = readPersistedSession();
    const persistedRequirement = persisted.artifacts.find(
      (artifact) => artifact.id === requirement.id,
    );

    expect(persisted.id).toBe(savedSession.id);
    expect(persisted.title).toBe(savedSession.title);
    expect(persisted.selectedArtifactId).toBe(requirement.id);
    expect(persisted.visualizationMode).toBe("risks");
    expect(persisted.followDiscussion).toBe(false);
    expect(persisted.messages.map(messageMetadata)).toEqual(
      savedSession.messages.map(messageMetadata),
    );
    expect(persisted.links).toEqual(savedSession.links);
    expect(persistedRequirement?.source).toEqual(requirement.source);
    expect(persistedRequirement?.tags).toEqual(requirement.tags);
    expect(persisted.attachmentsMetadata).toEqual(
      savedSession.attachmentsMetadata,
    );
    expect(persisted.readinessState).toEqual(savedSession.readinessState);
    expect(persisted.backupProvenance).toEqual(expectedBackupProvenance);
  });
});

function messageMetadata(message: WorkshopSession["messages"][number]) {
  return {
    id: message.id,
    createdAt: message.createdAt,
    relatedArtifactIds: message.relatedArtifactIds,
  };
}
