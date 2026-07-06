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

  const upstream = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CODEX_MODEL,
      instructions: workshopInstructions(),
      input: JSON.stringify(
        {
          latestHumanMessage:
            message || "The human attached files for workshop review.",
          newAttachments: attachments,
          session: payload.session ?? {},
        },
        null,
        2,
      ),
      store: false,
    }),
  });

  const data = (await upstream.json()) as OpenAIResponsePayload;
  if (!upstream.ok) {
    throw new Error(data.error?.message ?? "OpenAI Responses API failed.");
  }

  return parseCodexTurn(extractOutputText(data));
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
