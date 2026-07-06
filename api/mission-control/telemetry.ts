import {
  appendMissionControlTelemetryRecord,
  readMissionControlTelemetryFile,
} from "../../server/missionControlTelemetryApi.js";

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
  if (request.method === "GET") {
    try {
      response.status(200).json(await readMissionControlTelemetryFile());
    } catch (error) {
      response.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Mission Control telemetry read failed.",
      });
    }
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    response
      .status(202)
      .json(
        await appendMissionControlTelemetryRecord(normalizeBody(request.body)),
      );
  } catch (error) {
    response.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Mission Control telemetry ingest failed.",
    });
  }
}

function normalizeBody(body: unknown) {
  if (typeof body === "string") {
    return JSON.parse(body) as unknown;
  }

  return body;
}
