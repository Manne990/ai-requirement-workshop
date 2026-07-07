import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  handleWorkshopRecordsRequest,
  workshopRecordsDir,
  type ServerWorkshopRecord,
  type WorkshopRecordsApiEnv,
} from "./workshopRecordsApi.js";

describe("workshopRecordsApi", () => {
  let tempDir: string;
  let env: WorkshopRecordsApiEnv;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "workshop-records-api-"));
    env = {
      AI_REQUIREMENT_WORKSHOP_SERVER_STORE_DIR: tempDir,
      NODE_ENV: "test",
    };
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  it("saves, lists, and loads organization-scoped workshop records", async () => {
    const record = createServerRecord("server-workshop-1");

    await expect(
      handleWorkshopRecordsRequest(
        {
          method: "PUT",
          url: "/api/workshops/server-workshop-1",
          body: { record },
        },
        env,
      ),
    ).resolves.toMatchObject({
      statusCode: 201,
      body: {
        saved: true,
        recordId: "server-workshop-1",
        updatedAt: record.updatedAt,
        revision: expect.any(String),
      },
    });

    await expect(
      handleWorkshopRecordsRequest(
        { method: "GET", url: "/api/workshops" },
        env,
      ),
    ).resolves.toMatchObject({
      statusCode: 200,
      body: {
        summaries: [
          expect.objectContaining({
            id: "server-workshop-1",
            organizationId: "organization-001",
            revision: expect.any(String),
            messageCount: record.session.messages.length,
          }),
        ],
      },
    });

    await expect(
      handleWorkshopRecordsRequest(
        {
          method: "GET",
          url: "/api/workshops/server-workshop-1",
        },
        env,
      ),
    ).resolves.toMatchObject({
      statusCode: 200,
      body: {
        record: expect.objectContaining({
          id: "server-workshop-1",
          organizationId: "organization-001",
          revision: expect.any(String),
        }),
      },
    });
    expect(workshopRecordsDir(env)).toBe(tempDir);
  });

  it("rejects stale writes to existing workshop records", async () => {
    const record = createServerRecord("server-workshop-conflict");
    const initialSave = await handleWorkshopRecordsRequest(
      {
        method: "PUT",
        url: "/api/workshops/server-workshop-conflict",
        body: { record },
      },
      env,
    );
    expect(initialSave.statusCode).toBe(201);
    const revision =
      typeof initialSave.body === "object" &&
      initialSave.body &&
      "revision" in initialSave.body &&
      typeof initialSave.body.revision === "string"
        ? initialSave.body.revision
        : "";
    expect(revision).toMatch(/[a-f0-9]{32}/);

    await expect(
      handleWorkshopRecordsRequest(
        {
          method: "PUT",
          url: "/api/workshops/server-workshop-conflict",
          body: { record: { ...record, title: "Unsafely overwritten" } },
        },
        env,
      ),
    ).resolves.toMatchObject({
      statusCode: 409,
      body: {
        error:
          "Workshop update requires expected revision for an existing record.",
        currentRevision: revision,
      },
    });

    await expect(
      handleWorkshopRecordsRequest(
        {
          method: "PUT",
          url: "/api/workshops/server-workshop-conflict",
          headers: { "if-match": "stale-revision" },
          body: {
            record: { ...record, title: "Stale overwrite attempt" },
            expectedRevision: "stale-revision",
          },
        },
        env,
      ),
    ).resolves.toMatchObject({
      statusCode: 409,
      body: {
        error: "Workshop revision conflict. Reload the workshop before saving.",
        expectedRevision: "stale-revision",
        currentRevision: revision,
      },
    });

    await expect(
      handleWorkshopRecordsRequest(
        {
          method: "PUT",
          url: "/api/workshops/server-workshop-conflict",
          headers: { "If-Match": revision },
          body: {
            record: {
              ...record,
              title: "Safely revised",
              updatedAt: "2026-07-06T21:32:00.000Z",
              session: {
                ...record.session,
                title: "Safely revised",
                updatedAt: "2026-07-06T21:32:00.000Z",
              },
            },
            expectedRevision: revision,
          },
        },
        env,
      ),
    ).resolves.toMatchObject({
      statusCode: 200,
      body: {
        saved: true,
        recordId: "server-workshop-conflict",
        revision: expect.not.stringMatching(revision),
      },
    });
  });

  it("rejects mismatched ids and unscoped server records", async () => {
    const record = createServerRecord("server-workshop-2");

    await expect(
      handleWorkshopRecordsRequest(
        {
          method: "PUT",
          url: "/api/workshops/other-workshop",
          body: { record },
        },
        env,
      ),
    ).resolves.toMatchObject({
      statusCode: 400,
      body: { error: "Workshop URL id does not match record id." },
    });

    await expect(
      handleWorkshopRecordsRequest(
        {
          method: "PUT",
          url: "/api/workshops/server-workshop-2",
          body: { record: { ...record, organizationId: undefined } },
        },
        env,
      ),
    ).resolves.toMatchObject({
      statusCode: 400,
      body: {
        error: "Server-backed workshop records require organizationId.",
      },
    });
  });

  it("fails closed in production", async () => {
    await expect(
      handleWorkshopRecordsRequest(
        { method: "GET", url: "/api/workshops" },
        {
          AI_REQUIREMENT_WORKSHOP_SERVER_STORE_DIR: tempDir,
          NODE_ENV: "production",
        },
      ),
    ).resolves.toEqual({
      statusCode: 501,
      body: {
        error:
          "Server-backed workshop records require authenticated storage in production.",
      },
    });

    await expect(
      handleWorkshopRecordsRequest(
        { method: "GET", url: "/api/workshops" },
        {
          AI_REQUIREMENT_WORKSHOP_SERVER_STORE_DIR: tempDir,
          NODE_ENV: "production",
          AI_REQUIREMENT_WORKSHOP_ALLOW_UNAUTHENTICATED_WORKSHOP_RECORDS:
            "true",
        },
      ),
    ).resolves.toEqual({
      statusCode: 501,
      body: {
        error:
          "Server-backed workshop records require authenticated storage in production.",
      },
    });
  });
});

function createServerRecord(id: string): ServerWorkshopRecord {
  return {
    id,
    organizationId: "organization-001",
    revision: "client-draft",
    title: "Server backed workshop",
    createdAt: "2026-07-06T21:30:00.000Z",
    updatedAt: "2026-07-06T21:31:00.000Z",
    session: {
      id,
      title: "Server backed workshop",
      createdAt: "2026-07-06T21:30:00.000Z",
      updatedAt: "2026-07-06T21:31:00.000Z",
      participants: [],
      messages: [
        {
          id: "message-1",
          participantId: "human",
          kind: "human-input",
          body: "A team needs a server-backed workshop record.",
          relatedArtifactIds: [],
          createdAt: "2026-07-06T21:31:00.000Z",
        },
      ],
      artifacts: [],
      attachments: [],
      links: [],
      prototypes: [],
      visualizationMode: "process",
      followDiscussion: true,
    },
    seenInsightIdsByParticipant: {},
  };
}
