import {
  CODEX_MODEL,
  codexStatusEndpoint,
  codexWorkshopTurnEndpoint,
} from "./constants";
import type { AttachmentDraft } from "../domain/attachments";
import type { CodexWorkshopTurn } from "../domain/codexWorkshop";
import { buildSafeAiWorkshopPayload } from "../domain/security";
import type { OrganizationState } from "../domain/organization";
import type { WorkshopSession } from "../domain/workshop";

export type CodexStatus = {
  configured: boolean;
  model: string;
  message: string;
};

export type CodexWorkshopScope = {
  organizationState: OrganizationState;
  organizationId: string;
  actorUserId: string;
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
  scope?: CodexWorkshopScope,
): Promise<CodexWorkshopTurn> {
  const boundary = buildSafeAiWorkshopPayload({
    session,
    message,
    attachments,
    organizationState: scope?.organizationState,
    actorUserId: scope?.actorUserId,
    workshop: scope
      ? {
          id: session.id,
          organizationId: scope.organizationId,
        }
      : undefined,
  });
  const response = await fetch(codexWorkshopTurnEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(boundary.payload),
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
