import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import {
  codexStatusPayload,
  createCodexWorkshopTurn,
  type IncomingBody,
} from "./server/codexWorkshopApi.js";
import {
  appendMissionControlTelemetryRecord,
  readMissionControlTelemetryFile,
} from "./server/missionControlTelemetryApi.js";

export default defineConfig({
  plugins: [react(), codexWorkshopApi()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    globals: true,
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
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
          sendJson(
            response,
            200,
            codexStatusPayload({ OPENAI_API_KEY: apiKey }),
          );
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

        if (pathname === "/api/mission-control/telemetry") {
          if (request.method === "GET") {
            try {
              sendJson(
                response,
                200,
                await readMissionControlTelemetryFile(process.env),
              );
            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : "Mission Control telemetry read failed.";
              sendJson(response, 500, { error: message });
            }
            return;
          }

          if (request.method !== "POST") {
            sendJson(response, 405, { error: "Method not allowed." });
            return;
          }

          try {
            const payload = await readJsonBody(request);
            const result = await appendMissionControlTelemetryRecord(payload);
            sendJson(response, 202, result);
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Mission Control telemetry ingest failed.";
            sendJson(response, 400, { error: message });
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

type BackupBody = IncomingBody & {
  schema_version?: unknown;
  kind?: unknown;
  exportedAt?: unknown;
  record?: unknown;
};

function readJsonBody(request: NodeJS.ReadableStream): Promise<BackupBody> {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? (JSON.parse(raw) as BackupBody) : {});
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Invalid JSON."));
      }
    });
    request.on("error", reject);
  });
}

async function writeWorkshopBackup(payload: BackupBody) {
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
