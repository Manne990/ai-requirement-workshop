import { CODEX_MODEL } from "../src/codex/constants.js";

export type IncomingBody = {
  message?: unknown;
  session?: unknown;
  attachments?: unknown;
};

type OpenAIResponsePayload = {
  output_text?: string;
  output?: {
    type?: string;
    content?: {
      type?: string;
      text?: string;
    }[];
  }[];
  error?: {
    message?: string;
  };
};

type Env = Record<string, string | undefined>;

export function codexApiKey(env: Env = process.env) {
  return env.OPENAI_API_KEY ?? env.CODEX_API_TOKEN ?? "";
}

export function codexStatusPayload(env: Env = process.env) {
  const configured = Boolean(codexApiKey(env));
  return {
    configured,
    model: CODEX_MODEL,
    message: configured
      ? "Local Codex token loaded from environment."
      : "Set OPENAI_API_KEY in .env.local or shell environment.",
  };
}

export async function createCodexWorkshopTurn(
  apiKey: string,
  payload: IncomingBody,
  fetchImpl: typeof fetch = fetch,
) {
  const message =
    typeof payload.message === "string" ? payload.message.trim() : "";
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : [];
  if (!message && attachments.length === 0) {
    throw new Error("Missing workshop message or attachment.");
  }
  const safePayload = createServerSafeWorkshopPayload({
    message,
    attachments,
    session: payload.session,
  });

  const upstream = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CODEX_MODEL,
      instructions: workshopInstructions(),
      input: JSON.stringify(safePayload, null, 2),
      store: false,
    }),
  });

  const data = (await upstream.json()) as OpenAIResponsePayload;
  if (!upstream.ok) {
    throw new Error(data.error?.message ?? "OpenAI Responses API failed.");
  }

  return parseCodexTurn(extractOutputText(data));
}

export function createServerSafeWorkshopPayload(payload: IncomingBody) {
  const message =
    typeof payload.message === "string" ? payload.message.trim() : "";
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : [];

  return {
    latestHumanMessage:
      safeString(message, 2000) ||
      "The human attached files for workshop review.",
    newAttachments: attachments.slice(0, 12).map(readSafeAttachment),
    session: readSafeSession(payload.session),
  };
}

export function parseCodexTurn(output: string) {
  const json = extractJson(output);
  const parsed = JSON.parse(json) as {
    facilitatorMessage?: unknown;
    artifacts?: unknown;
    participantUpdates?: unknown;
  };

  if (typeof parsed.facilitatorMessage !== "string") {
    throw new Error("Codex response did not include facilitatorMessage.");
  }

  return {
    facilitatorMessage: parsed.facilitatorMessage,
    artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
    participantUpdates: Array.isArray(parsed.participantUpdates)
      ? parsed.participantUpdates
      : [],
  };
}

export function workshopInstructions() {
  return `You are the Codex model powering AI Requirement Workshop.
The product is a live workshop room where a human and AI specialist lenses shape requirements on a canvas.
Respond in the same language as latestHumanMessage.
The facilitator must ask exactly one calm follow-up question and then wait for the human.
Specialist lenses must contribute through canvas artifacts, not chat messages.
New attachments are already captured as source artifacts by the app. Use their extractedText and summary as evidence, but do not duplicate source artifacts unless a source needs clarification.
Do not repeat a question already visible in recentMessages.
Do not produce a final recommendation until the human asks for a report.
Return only JSON with this shape:
{
  "facilitatorMessage": "string, one short facilitator message ending with one question",
  "artifacts": [
    {
      "type": "source|problem|goal|actor|flow-step|requirement|risk|assumption|question|decision",
      "title": "short title",
      "content": "specific workshop material",
      "createdBy": "facilitator|agent-business|agent-ux|agent-risk|agent-technical|agent-quality",
      "tags": ["short-tag"]
    }
  ],
  "participantUpdates": [
    {
      "participantId": "facilitator|agent-business|agent-ux|agent-risk|agent-technical|agent-quality",
      "status": "listening|thinking|commenting|concern|idle",
      "currentActivity": "short current activity"
    }
  ]
}
Create 2-6 artifacts. Prefer concrete requirements, risks, assumptions, actors, and questions that can be inspected on the canvas.`;
}

function extractOutputText(data: OpenAIResponsePayload) {
  if (data.output_text) {
    return data.output_text;
  }

  return (
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .join("\n")
      .trim() ?? ""
  );
}

function extractJson(output: string) {
  const trimmed = output.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Codex response was not valid JSON.");
  }

  return trimmed.slice(start, end + 1);
}

function readSafeSession(value: unknown) {
  const session = isObject(value) ? value : {};
  return {
    title: safeString(session.title, 180),
    visualizationMode: safeString(session.visualizationMode, 40),
    followDiscussion:
      typeof session.followDiscussion === "boolean"
        ? session.followDiscussion
        : true,
    participants: readArray(session.participants)
      .slice(0, 12)
      .map((participant) => ({
        id: safeString(participant.id, 80),
        type: safeString(participant.type, 40),
        name: safeString(participant.name, 120),
        perspective: safeString(participant.perspective, 240),
        status: safeString(participant.status, 40),
        currentActivity: safeString(participant.currentActivity, 240),
      })),
    recentMessages: readArray(session.recentMessages)
      .slice(-8)
      .map((message) => ({
        participantId: safeString(message.participantId, 80),
        kind: safeString(message.kind, 40),
        body: safeString(message.body, 2000),
      })),
    artifacts: readArray(session.artifacts)
      .slice(-24)
      .map((artifact) => ({
        id: safeString(artifact.id, 100),
        type: safeString(artifact.type, 40),
        title: safeString(artifact.title, 180),
        content: safeString(artifact.content, 3000),
        status: safeString(artifact.status, 40),
        createdBy: safeString(artifact.createdBy, 80),
        tags: readStringArray(artifact.tags, 8, 40),
      })),
    attachments: readArray(session.attachments)
      .slice(-12)
      .map(readSafeAttachment),
  };
}

function readSafeAttachment(value: unknown) {
  const attachment = isObject(value) ? value : {};
  return {
    name: safeString(attachment.name, 180),
    mimeType: safeString(attachment.mimeType, 120),
    size: readNumber(attachment.size),
    status: safeString(attachment.status, 60),
    summary: safeString(attachment.summary, 1000),
    extractedText: safeString(attachment.extractedText, 6000),
    tags: readStringArray(attachment.tags, 8, 40),
  };
}

function readArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject).map((item) => item) : [];
}

function readStringArray(value: unknown, limit: number, maxLength: number) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .slice(0, limit)
        .map((item) => safeString(item, maxLength))
    : [];
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeString(value: unknown, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  const redacted = redactServerSensitiveText(value.trim());
  return redacted.length <= maxLength
    ? redacted
    : `${redacted.slice(0, Math.max(0, maxLength - 3))}...`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function redactServerSensitiveText(text: string) {
  return text
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      "[REDACTED:private-key]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "[REDACTED:bearer-token]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "[REDACTED:jwt]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED:api-key]")
    .replace(
      /\b(?:password|passcode|secret|api[_-]?key|token)\s*[:=]\s*["']?[^"'\s,;]{6,}["']?/gi,
      "[REDACTED:credential]",
    )
    .replace(/\b(?:19|20)?\d{6}[-+]\d{4}\b/g, "[REDACTED:personal-id]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED:email]");
}
