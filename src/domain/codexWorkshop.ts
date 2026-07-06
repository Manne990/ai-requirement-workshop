import { type AttachmentDraft, type WorkshopAttachment } from "./attachments";
import {
  participantIds,
  type ArtifactLink,
  type ArtifactStatus,
  type ArtifactType,
  type Participant,
  type ParticipantStatus,
  type WorkshopArtifact,
  type WorkshopMessage,
  type WorkshopSession,
} from "./workshop";

export type CodexArtifactDraft = {
  type: ArtifactType;
  title: string;
  content: string;
  createdBy: string;
  tags?: string[];
};

export type CodexParticipantUpdate = {
  participantId: string;
  status: ParticipantStatus;
  currentActivity: string;
};

export type CodexWorkshopTurn = {
  facilitatorMessage: string;
  artifacts: CodexArtifactDraft[];
  participantUpdates?: CodexParticipantUpdate[];
};

const validArtifactTypes: ArtifactType[] = [
  "source",
  "problem",
  "goal",
  "actor",
  "flow-step",
  "requirement",
  "risk",
  "assumption",
  "question",
  "decision",
];

const validParticipantIds = Object.values(participantIds);

const now = () => new Date().toISOString();

export function applyCodexWorkshopTurn(
  session: WorkshopSession,
  body: string,
  turn: CodexWorkshopTurn,
  attachments: AttachmentDraft[] = [],
  createdAt = now(),
): WorkshopSession {
  const trimmed = body.trim() || attachmentOnlyMessage(attachments);
  if (!trimmed && attachments.length === 0) {
    return session;
  }

  const messageIndex = session.messages.length + 1;
  const humanMessage: WorkshopMessage = {
    id: createId("message", messageIndex),
    participantId: participantIds.human,
    kind: "human-input",
    body: trimmed,
    createdAt,
    relatedArtifactIds: [],
  };

  const normalizedAttachments = normalizeAttachments(
    attachments,
    session,
    humanMessage.id,
    createdAt,
  );
  const attachmentArtifacts = createAttachmentArtifacts(
    normalizedAttachments,
    session.artifacts.length + 1,
    humanMessage.id,
    createdAt,
  );
  const codexArtifacts = normalizeCodexArtifacts(
    turn.artifacts,
    session,
    humanMessage.id,
    createdAt,
    attachmentArtifacts.length,
  );
  const artifacts = [...attachmentArtifacts, ...codexArtifacts];
  humanMessage.relatedArtifactIds = artifacts.map((artifact) => artifact.id);

  const facilitatorMessage: WorkshopMessage = {
    id: createId("message", messageIndex + 1),
    participantId: participantIds.facilitator,
    kind: "facilitator-guidance",
    body: normalizeFacilitatorMessage(turn.facilitatorMessage),
    createdAt,
    relatedArtifactIds: artifacts
      .filter((artifact) => artifact.type === "question")
      .slice(0, 2)
      .map((artifact) => artifact.id),
  };

  const selectedArtifactId =
    session.followDiscussion && artifacts.length > 0
      ? artifacts[artifacts.length - 1]?.id
      : session.selectedArtifactId;

  return {
    ...session,
    messages: [...session.messages, humanMessage, facilitatorMessage],
    attachments: [...(session.attachments ?? []), ...normalizedAttachments],
    artifacts: [...session.artifacts, ...artifacts],
    links: [
      ...session.links,
      ...createCodexLinks(session.artifacts, artifacts, session.links.length),
    ],
    participants: updateParticipantsFromCodex(
      session.participants,
      artifacts,
      turn.participantUpdates ?? [],
    ),
    selectedArtifactId,
    updatedAt: createdAt,
  };
}

function normalizeCodexArtifacts(
  drafts: CodexArtifactDraft[],
  session: WorkshopSession,
  messageId: string,
  createdAt: string,
  indexOffset = 0,
) {
  return drafts
    .map(readCodexArtifactDraft)
    .filter((draft) => draft.title && draft.content)
    .slice(0, 8)
    .map<WorkshopArtifact>((draft, index) => {
      const type: ArtifactType = validArtifactTypes.includes(
        draft.type as ArtifactType,
      )
        ? (draft.type as ArtifactType)
        : "assumption";
      const createdBy = isValidParticipantId(draft.createdBy)
        ? draft.createdBy
        : participantIds.facilitator;

      return {
        id: createId(
          `artifact-${type}`,
          session.artifacts.length + indexOffset + index + 1,
        ),
        type,
        title: draft.title.trim(),
        content: draft.content.trim(),
        status: "draft" satisfies ArtifactStatus,
        createdBy,
        updatedAt: createdAt,
        source: {
          messageId,
          participantId: createdBy,
        },
        tags: [...new Set(["codex", ...(draft.tags ?? [])])].slice(0, 6),
      };
    });
}

function normalizeAttachments(
  drafts: AttachmentDraft[],
  session: WorkshopSession,
  sourceMessageId: string,
  createdAt: string,
): WorkshopAttachment[] {
  const attachmentStartIndex = (session.attachments ?? []).length + 1;

  return drafts.map((draft, index) => ({
    id: createId("attachment", attachmentStartIndex + index),
    name: draft.name,
    mimeType: draft.mimeType,
    size: draft.size,
    extractedText: draft.extractedText,
    summary: draft.summary,
    status: draft.status,
    tags: draft.tags,
    sourceMessageId,
    createdAt,
  }));
}

function createAttachmentArtifacts(
  attachments: WorkshopAttachment[],
  startIndex: number,
  messageId: string,
  createdAt: string,
): WorkshopArtifact[] {
  return attachments.map((attachment, index) => ({
    id: createId("artifact-source", startIndex + index),
    type: "source",
    title: attachment.name,
    content: attachment.summary,
    status: "draft" satisfies ArtifactStatus,
    createdBy: participantIds.facilitator,
    updatedAt: createdAt,
    source: {
      messageId,
      participantId: participantIds.human,
    },
    tags: attachment.tags,
  }));
}

function attachmentOnlyMessage(attachments: AttachmentDraft[]) {
  if (attachments.length === 0) {
    return "";
  }

  const fileNames = attachments.map((attachment) => attachment.name).join(", ");
  return `Attached files for workshop review: ${fileNames}`;
}

function readCodexArtifactDraft(draft: unknown) {
  const record =
    draft && typeof draft === "object"
      ? (draft as Record<string, unknown>)
      : {};

  return {
    type: typeof record.type === "string" ? record.type : "assumption",
    title: typeof record.title === "string" ? record.title.trim() : "",
    content: typeof record.content === "string" ? record.content.trim() : "",
    createdBy:
      typeof record.createdBy === "string"
        ? record.createdBy
        : participantIds.facilitator,
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
  };
}

function normalizeFacilitatorMessage(message: string) {
  const trimmed = message.trim();
  return (
    trimmed ||
    "I captured the latest contribution on the canvas. What should we clarify next?"
  );
}

function createCodexLinks(
  existingArtifacts: WorkshopArtifact[],
  artifacts: WorkshopArtifact[],
  existingLinkCount: number,
): ArtifactLink[] {
  const anchor =
    existingArtifacts.find((artifact) => artifact.status === "accepted") ??
    existingArtifacts.find((artifact) => artifact.type === "problem") ??
    artifacts.find((artifact) => artifact.type === "problem");

  if (!anchor) {
    return [];
  }

  return artifacts
    .filter((artifact) => artifact.id !== anchor.id)
    .map((artifact, index) => ({
      id: createId("link", existingLinkCount + index + 1),
      sourceArtifactId: anchor.id,
      targetArtifactId: artifact.id,
      label: artifact.type,
    }));
}

function updateParticipantsFromCodex(
  participants: Participant[],
  artifacts: WorkshopArtifact[],
  updates: CodexParticipantUpdate[],
): Participant[] {
  const activeParticipantIds = new Set(
    artifacts.map((artifact) => artifact.createdBy),
  );

  return participants.map((participant) => {
    const explicit = updates.find(
      (update) => update.participantId === participant.id,
    );
    if (explicit) {
      return {
        ...participant,
        status: explicit.status,
        currentActivity: explicit.currentActivity,
      };
    }

    if (participant.id === participantIds.facilitator) {
      return {
        ...participant,
        status: "commenting",
        currentActivity: "Guiding the Codex-backed workshop turn",
      };
    }

    if (participant.type === "agent") {
      return {
        ...participant,
        status: activeParticipantIds.has(participant.id)
          ? "thinking"
          : "listening",
        currentActivity: activeParticipantIds.has(participant.id)
          ? "Contributed through the Codex model"
          : "Listening for relevant signals",
      };
    }

    return {
      ...participant,
      status: "listening",
      currentActivity: "Reviewing the canvas",
    };
  });
}

function isValidParticipantId(
  participantId: string,
): participantId is (typeof validParticipantIds)[number] {
  return validParticipantIds.includes(
    participantId as (typeof validParticipantIds)[number],
  );
}

function createId(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(3, "0")}`;
}
