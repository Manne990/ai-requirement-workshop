import {
  codexApiKey,
  createCodexWorkshopTurn,
  isUnauthenticatedCodexWorkshopApiEnabled,
  type IncomingBody,
} from "../../server/codexWorkshopApi.js";

type JsonRequest = {
  method?: string;
  body?: unknown;
};

type JsonResponse = {
  status: (statusCode: number) => {
    json: (payload: unknown) => void;
  };
};

export default async function handler(
  request: JsonRequest,
  response: JsonResponse,
) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  if (!isUnauthenticatedCodexWorkshopApiEnabled()) {
    response.status(501).json({
      error:
        "Codex workshop turns require an authenticated server boundary in production.",
    });
    return;
  }

  const apiKey = codexApiKey();
  if (!apiKey) {
    response.status(409).json({
      error:
        "Codex token missing. Set OPENAI_API_KEY or CODEX_API_TOKEN in the deployment environment.",
    });
    return;
  }

  try {
    const turn = await createCodexWorkshopTurn(
      apiKey,
      normalizeBody(request.body),
    );
    response.status(200).json({ turn });
  } catch (error) {
    response.status(500).json({
      error:
        error instanceof Error ? error.message : "Codex workshop turn failed.",
    });
  }
}

function normalizeBody(body: unknown): IncomingBody {
  if (typeof body === "string") {
    return JSON.parse(body) as IncomingBody;
  }

  if (body && typeof body === "object") {
    return body as IncomingBody;
  }

  return {};
}
