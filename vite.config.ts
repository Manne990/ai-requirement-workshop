import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { CODEX_MODEL } from "./src/codex/constants.js";

export default defineConfig({
  plugins: [react(), codexWorkshopApi()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    globals: true,
  },
});

function codexWorkshopApi(): Plugin {
  let apiKey = "";

  return {
    name: "codex-workshop-api",
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, "");
      apiKey =
        env.OPENAI_API_KEY ??
        env.CODEX_API_TOKEN ??
        process.env.OPENAI_API_KEY ??
        process.env.CODEX_API_TOKEN ??
        "";
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split("?")[0] ?? "";

        if (pathname === "/api/codex/status") {
          sendJson(response, 200, {
            configured: Boolean(apiKey),
            model: CODEX_MODEL,
            message: apiKey
              ? "Local Codex token loaded from environment."
              : "Set OPENAI_API_KEY in .env.local or shell environment.",
          });
          return;
        }

        if (pathname === "/api/workshops/backup") {
          if (request.method !== "POST") {
            sendJson(response, 405, { error: "Method not allowed." });
            return;
          }

          try {
            const payload = await readJsonBody(request);
            const backup = await writeWorkshopBackup(payload);
            sendJson(response, 200, backup);
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Workshop backup failed.";
            sendJson(response, 500, { error: message });
          }
          return;
        }

        if (pathname !== "/api/codex/workshop-turn") {
          next();
          return;
        }

        if (request.method !== "POST") {
          sendJson(response, 405, { error: "Method not allowed." });
          return;
        }

        if (!apiKey) {
          sendJson(response, 409, {
            error:
              "Codex token missing. Set OPENAI_API_KEY in .env.local or shell environment.",
          });
          return;
        }

        try {
          const payload = await readJsonBody(request);
          const turn = await createCodexWorkshopTurn(apiKey, payload);
          sendJson(response, 200, { turn });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Codex workshop turn failed.";
          sendJson(response, 500, { error: message });
        }
      });
    },
  };
}

type IncomingBody = {
  message?: unknown;
  session?: unknown;
  attachments?: unknown;
  schema_version?: unknown;
  kind?: unknown;
  exportedAt?: unknown;
  record?: unknown;
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

function readJsonBody(request: NodeJS.ReadableStream): Promise<IncomingBody> {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? (JSON.parse(raw) as IncomingBody) : {});
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Invalid JSON."));
      }
    });
    request.on("error", reject);
  });
}

async function writeWorkshopBackup(payload: IncomingBody) {
  if (
    payload.schema_version !== 1 ||
    payload.kind !== "AI_REQUIREMENT_WORKSHOP_RECORD_EXPORT"
  ) {
    throw new Error("Invalid workshop backup envelope.");
  }

  const record = payload.record;
  if (!isObject(record) || typeof record.id !== "string" || !record.id.trim()) {
    throw new Error("Workshop backup record is missing an id.");
  }

  const backedUpAt = new Date().toISOString();
  const backupDir =
    process.env.AI_REQUIREMENT_WORKSHOP_BACKUP_DIR ??
    join(homedir(), ".gaia", "ai-requirement-workshop", "workshops");
  const fileName = `${safeFileName(record.id)}.json`;
  const targetPath = join(backupDir, fileName);
  const tempPath = join(backupDir, `.${fileName}.${Date.now()}.tmp`);
  const body = {
    ...payload,
    exportedAt:
      typeof payload.exportedAt === "string" ? payload.exportedAt : backedUpAt,
    backedUpAt,
  };

  await mkdir(backupDir, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  await rename(tempPath, targetPath);

  return {
    backedUp: true,
    backedUpAt,
    message: "Saved in browser and backed up to disk.",
  };
}

async function createCodexWorkshopTurn(apiKey: string, payload: IncomingBody) {
  const message =
    typeof payload.message === "string" ? payload.message.trim() : "";
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : [];
  if (!message && attachments.length === 0) {
    throw new Error("Missing workshop message or attachment.");
  }

  const upstream = await fetch("https://api.openai.com/v1/responses", {
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

function workshopInstructions() {
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

function parseCodexTurn(output: string) {
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeFileName(value: string) {
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return safe || "workshop";
}

function sendJson(
  response: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string): void;
  },
  statusCode: number,
  payload: unknown,
) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}
