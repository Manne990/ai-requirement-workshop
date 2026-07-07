import { handleWorkshopRecordsRequest } from "../../server/workshopRecordsApi.js";

type JsonRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: {
    id?: string | string[];
  };
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
  const id = Array.isArray(request.query?.id)
    ? request.query?.id[0]
    : request.query?.id;
  const result = await handleWorkshopRecordsRequest({
    method: request.method,
    url: `/api/workshops/${encodeURIComponent(id ?? "")}`,
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
