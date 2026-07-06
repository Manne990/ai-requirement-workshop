import {
  CODEX_MODEL,
  codexStatusEndpoint,
  codexWorkshopTurnEndpoint,
} from "./constants";
import type { AttachmentDraft } from "../domain/attachments";
import type { CodexWorkshopTurn } from "../domain/codexWorkshop";
import type { WorkshopSession } from "../domain/workshop";

export type CodexStatus = {
  configured: boolean;
  model: string;
  message: string;
};

export async function fetchCodexStatus(): Promise<CodexStatus> {
  const response = await fetch(codexStatusEndpoint);
  if (!response.ok) {
    return {
      configured: false,
      model: CODEX_MODEL,
      message: "Codex status endpoint is not available.",
    };
  }

  return (await response.json()) as CodexStatus;
}

export async function requestCodexWorkshopTurn(
  session: WorkshopSession,
  message: string,
  attachments: AttachmentDraft[] = [],
): Promise<CodexWorkshopTurn> {
  const response = await fetch(codexWorkshopTurnEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: summarizeSession(session),
      message,
      attachments: attachments.map((attachment) => ({
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        status: attachment.status,
        summary: attachment.summary,
        extractedText: attachment.extractedText.slice(0, 6000),
        tags: attachment.tags,
      })),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    turn?: CodexWorkshopTurn;
    error?: string;
  };

  if (!response.ok || !payload.turn) {
    throw new Error(
      payload.error ?? "Codex could not produce a workshop turn.",
    );
  }

  return payload.turn;
}

function summarizeSession(session: WorkshopSession) {
  return {
    title: session.title,
    visualizationMode: session.visualizationMode,
    followDiscussion: session.followDiscussion,
    participants: session.participants.map((participant) => ({
      id: participant.id,
      type: participant.type,
      name: participant.name,
      perspective: participant.perspective,
      status: participant.status,
      currentActivity: participant.currentActivity,
    })),
    recentMessages: session.messages.slice(-8).map((message) => ({
      participantId: message.participantId,
      kind: message.kind,
      body: message.body,
    })),
    artifacts: session.artifacts.slice(-24).map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      content: artifact.content,
      status: artifact.status,
      createdBy: artifact.createdBy,
      tags: artifact.tags,
    })),
    attachments: (session.attachments ?? []).slice(-12).map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      status: attachment.status,
      summary: attachment.summary,
      tags: attachment.tags,
    })),
  };
}
