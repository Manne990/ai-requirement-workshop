import { codexStatusPayload } from "../../server/codexWorkshopApi.js";

type JsonResponse = {
  status: (statusCode: number) => {
    json: (payload: unknown) => void;
  };
};

export default function handler(_request: unknown, response: JsonResponse) {
  response.status(200).json(codexStatusPayload());
}
