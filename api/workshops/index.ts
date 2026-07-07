import { handleWorkshopRecordsRequest } from "../../server/workshopRecordsApi.js";

type JsonRequest = {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
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
  const result = await handleWorkshopRecordsRequest({
    method: request.method,
    url: "/api/workshops",
    headers: request.headers,
    body: normalizeBody(request.body),
  });

  response.status(result.statusCode).json(result.body);
}

function normalizeBody(body: unknown) {
  if (typeof body === "string") {
    return JSON.parse(body) as unknown;
  }

  return body;
}
