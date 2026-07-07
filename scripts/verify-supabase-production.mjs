#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const bucketName = "workshop-attachments";
const runId = new Date()
  .toISOString()
  .replaceAll(/[-:.TZ]/g, "")
  .slice(0, 14);

if (process.argv.includes("--help")) {
  console.log(`Usage: npm run test:supabase:production

Required environment:
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY

Optional:
  AI_REQUIREMENT_WORKSHOP_KEEP_PRODUCTION_VERIFY_DATA=1

The probe creates temporary Supabase Auth users, profiles, one organization,
one workshop, messages, artifacts, audit rows, attachment metadata, and one
storage object. It then verifies member/non-member access through real Supabase
clients and deletes the temporary data unless KEEP is enabled.`);
  process.exit(0);
}

const env = loadEnvironment();
let config;
const createdUserIds = [];
const cleanupTasks = [];
let orgId = null;
let uploadedObjectPath = null;

try {
  config = readConfig(env);
  await verifyProductionSupabase(config);
  console.log("Supabase production verification passed.");
} catch (error) {
  console.error("Supabase production verification failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (!config) {
    // No external state was touched.
  } else if (env.AI_REQUIREMENT_WORKSHOP_KEEP_PRODUCTION_VERIFY_DATA === "1") {
    console.warn("Keeping temporary Supabase verification data by request.");
  } else {
    await cleanup(config).catch((error) => {
      console.warn(
        `Supabase production verification cleanup warning: ${errorMessage(error)}`,
      );
    });
  }
}

async function verifyProductionSupabase(config) {
  const admin = createSupabaseClient(config.url, config.serviceRoleKey);
  const users = await createVerificationUsers(admin);
  const clients = await createSignedInClients(config, users);

  for (const user of Object.values(users)) {
    await insertProfile(clients[user.key], user);
  }

  const owner = clients.owner;
  const organization = await insertOne(
    owner.from("organizations").insert({
      name: `Gaia verification ${runId}`,
      slug: `gaia-verification-${runId}-${randomSuffix()}`,
      created_by: users.owner.id,
    }),
    "create verification organization",
  );
  orgId = organization.id;

  await insertOne(
    owner.from("memberships").insert({
      organization_id: orgId,
      user_id: users.owner.id,
      role: "owner",
      status: "active",
    }),
    "create owner bootstrap membership",
  );

  await expectInsert(
    owner.from("memberships").insert([
      {
        organization_id: orgId,
        user_id: users.facilitator.id,
        role: "facilitator",
        status: "active",
      },
      {
        organization_id: orgId,
        user_id: users.participant.id,
        role: "participant",
        status: "active",
      },
      {
        organization_id: orgId,
        user_id: users.viewer.id,
        role: "viewer",
        status: "active",
      },
    ]),
    "owner can add organization memberships",
  );

  const workshop = await insertOne(
    owner.from("workshops").insert({
      organization_id: orgId,
      title: `Gaia production verification ${runId}`,
      status: "active",
      created_by: users.owner.id,
      record_key: `production-verification-${runId}`,
      session_snapshot: {
        id: `production-verification-${runId}`,
        messages: [],
        artifacts: [],
      },
      requirements_snapshot: [],
      audit_events_snapshot: [],
      seen_insight_ids_by_participant: {},
    }),
    "owner can create workshop snapshot",
  );

  await expectVisibility(owner, "organizations", orgId, true, "owner org read");
  await expectVisibility(
    clients.participant,
    "organizations",
    orgId,
    true,
    "participant org read",
  );
  await expectVisibility(
    clients.outsider,
    "organizations",
    orgId,
    false,
    "outsider org denial",
  );
  await expectVisibility(
    clients.viewer,
    "workshops",
    workshop.id,
    true,
    "viewer workshop read",
  );
  await expectVisibility(
    clients.outsider,
    "workshops",
    workshop.id,
    false,
    "outsider workshop denial",
  );

  await expectMutation(
    clients.facilitator
      .from("workshops")
      .update({ title: `Facilitator verified ${runId}` })
      .eq("id", workshop.id),
    true,
    "facilitator can update workshop",
  );
  await expectMutation(
    clients.participant
      .from("workshops")
      .update({ title: `Participant should not update ${runId}` })
      .eq("id", workshop.id),
    false,
    "participant cannot update workshop",
  );

  await expectInsert(
    clients.participant.from("messages").insert({
      workshop_id: workshop.id,
      kind: "human-input",
      body: "RLS verification participant comment.",
      created_by: users.participant.id,
    }),
    "participant can comment",
  );
  await expectMutation(
    clients.viewer.from("messages").insert({
      workshop_id: workshop.id,
      kind: "human-input",
      body: "Viewer should not comment.",
      created_by: users.viewer.id,
    }),
    false,
    "viewer cannot comment",
  );

  const artifact = await insertOne(
    clients.facilitator.from("artifacts").insert({
      workshop_id: workshop.id,
      type: "requirement",
      title: "Verified requirement artifact",
      content: "A facilitator can create requirement artifacts.",
      status: "draft",
      created_by_user_id: users.facilitator.id,
      tags: ["production-verification"],
    }),
    "facilitator can create artifact",
  );
  await expectMutation(
    clients.participant.from("artifacts").insert({
      workshop_id: workshop.id,
      type: "requirement",
      title: "Participant should not create artifact",
      content: "This should be blocked by RLS.",
      status: "draft",
      created_by_user_id: users.participant.id,
      tags: ["production-verification"],
    }),
    false,
    "participant cannot create artifacts",
  );

  await expectInsert(
    owner.from("requirements").insert({
      workshop_id: workshop.id,
      source_artifact_id: artifact.id,
      title: "Verified requirement",
      statement: "The verified production environment enforces workshop RLS.",
      acceptance_criteria: ["Owner and facilitator writes are accepted."],
      status: "accepted",
    }),
    "owner can persist requirement",
  );

  await expectInsert(
    owner.from("audit_events").insert({
      organization_id: orgId,
      workshop_id: workshop.id,
      actor_user_id: users.owner.id,
      event_type: "production.verify",
      target_table: "workshops",
      target_id: workshop.id,
      metadata: { runId },
    }),
    "owner can write audit event",
  );
  await expectMutation(
    clients.participant.from("audit_events").insert({
      organization_id: orgId,
      workshop_id: workshop.id,
      actor_user_id: users.participant.id,
      event_type: "production.verify.participant",
      target_table: "workshops",
      target_id: workshop.id,
      metadata: { runId },
    }),
    false,
    "participant cannot write privileged audit event",
  );

  uploadedObjectPath = `organizations/${orgId}/workshops/${workshop.id}/attachments/${randomUUID()}/evidence.txt`;
  await expectStorageUpload(
    owner,
    uploadedObjectPath,
    "owner can upload attachment object",
  );
  await expectStorageDownload(
    clients.viewer,
    uploadedObjectPath,
    true,
    "viewer can read workshop attachment object",
  );
  await expectStorageDownload(
    clients.outsider,
    uploadedObjectPath,
    false,
    "outsider cannot read workshop attachment object",
  );
  await expectStorageUpload(
    clients.participant,
    `organizations/${orgId}/workshops/${workshop.id}/attachments/${randomUUID()}/participant.txt`,
    "participant cannot upload attachment object",
    false,
  );

  await expectInsert(
    owner.from("attachments").insert({
      workshop_id: workshop.id,
      file_name: "evidence.txt",
      content_type: "text/plain",
      size_bytes: 32,
      sha256:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      storage_path: uploadedObjectPath,
      status: "uploaded",
      created_by: users.owner.id,
    }),
    "owner can persist attachment metadata",
  );
  await expectVisibility(
    clients.outsider,
    "attachments",
    null,
    false,
    "outsider cannot read attachment metadata",
    { workshop_id: workshop.id },
  );
}

async function createVerificationUsers(admin) {
  const password = `Gaia-${runId}-${randomUUID()}-aA1!`;
  const definitions = [
    ["owner", "Owner"],
    ["facilitator", "Facilitator"],
    ["participant", "Participant"],
    ["viewer", "Viewer"],
    ["outsider", "Outsider"],
  ];
  const users = {};

  for (const [key, displayName] of definitions) {
    const email = `gaia-prod-${runId}-${randomSuffix()}-${key}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error || !data.user) {
      throw new Error(`create ${key} auth user failed: ${errorMessage(error)}`);
    }
    createdUserIds.push(data.user.id);
    users[key] = {
      key,
      id: data.user.id,
      email,
      password,
      displayName,
    };
  }

  return users;
}

async function createSignedInClients(config, users) {
  const clients = {};
  for (const [key, user] of Object.entries(users)) {
    const client = createSupabaseClient(config.url, config.anonKey);
    const { error } = await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (error) {
      throw new Error(`sign in ${key} failed: ${errorMessage(error)}`);
    }
    clients[key] = client;
  }
  return clients;
}

async function insertProfile(client, user) {
  await expectInsert(
    client.from("profiles").insert({
      id: user.id,
      email: user.email,
      display_name: user.displayName,
    }),
    `${user.key} can create own profile`,
  );
}

async function cleanup(config) {
  const admin = createSupabaseClient(config.url, config.serviceRoleKey);
  for (const task of cleanupTasks.reverse()) {
    await task(admin);
  }
  if (uploadedObjectPath) {
    await admin.storage.from(bucketName).remove([uploadedObjectPath]);
  }
  if (orgId) {
    await admin.from("organizations").delete().eq("id", orgId);
  }
  for (const userId of createdUserIds.reverse()) {
    await admin.auth.admin.deleteUser(userId);
  }
}

async function expectVisibility(
  client,
  table,
  id,
  shouldBeVisible,
  label,
  filters = {},
) {
  let query = client.from(table).select("id");
  if (id) {
    query = query.eq("id", id);
  }
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label} query failed: ${errorMessage(error)}`);
  }
  const visible = Array.isArray(data) && data.length > 0;
  if (visible !== shouldBeVisible) {
    throw new Error(
      `${label} expected visible=${shouldBeVisible}, got ${visible}.`,
    );
  }
  console.log(`ok: ${label}`);
}

async function insertOne(query, label) {
  const { data, error } = await query.select("*").single();
  if (error || !data) {
    throw new Error(`${label} failed: ${errorMessage(error)}`);
  }
  console.log(`ok: ${label}`);
  return data;
}

async function expectInsert(query, label) {
  const { error } = await query;
  if (error) {
    throw new Error(`${label} failed: ${errorMessage(error)}`);
  }
  console.log(`ok: ${label}`);
}

async function expectMutation(query, shouldSucceed, label) {
  const { error, count } = await query.select("id", {
    count: "exact",
  });
  const succeeded = !error && (count === null || count > 0);
  if (succeeded !== shouldSucceed) {
    throw new Error(
      `${label} expected success=${shouldSucceed}, got success=${succeeded}; ${errorMessage(error)}`,
    );
  }
  console.log(`ok: ${label}`);
}

async function expectStorageUpload(client, path, label, shouldSucceed = true) {
  const { error } = await client.storage.from(bucketName).upload(
    path,
    new Blob([`Gaia production verification ${runId}`], {
      type: "text/plain",
    }),
    { contentType: "text/plain", upsert: false },
  );
  const succeeded = !error;
  if (succeeded !== shouldSucceed) {
    throw new Error(
      `${label} expected success=${shouldSucceed}, got success=${succeeded}; ${errorMessage(error)}`,
    );
  }
  console.log(`ok: ${label}`);
}

async function expectStorageDownload(client, path, shouldSucceed, label) {
  const { data, error } = await client.storage.from(bucketName).download(path);
  const succeeded = !error && data instanceof Blob;
  if (succeeded !== shouldSucceed) {
    throw new Error(
      `${label} expected success=${shouldSucceed}, got success=${succeeded}; ${errorMessage(error)}`,
    );
  }
  console.log(`ok: ${label}`);
}

function createSupabaseClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "gaia-production-verifier",
      },
    },
  });
}

function readConfig(env) {
  const url = readRequiredEnv(env, "VITE_SUPABASE_URL");
  const anonKey = readRequiredEnv(env, "VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = readRequiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY");

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error(
      "VITE_SUPABASE_URL must be a real Supabase project URL, for example https://project.supabase.co.",
    );
  }
  if (url.includes("example-project") || anonKey.includes("public-anon-key")) {
    throw new Error(
      "Supabase production verification cannot use placeholder env values.",
    );
  }

  return { url, anonKey, serviceRoleKey };
}

function readRequiredEnv(env, key) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required for Supabase production verification.`);
  }
  return stripQuotes(value);
}

function loadEnvironment() {
  const fileEnv = {};
  for (const fileName of [".env", ".env.local"]) {
    if (!existsSync(fileName)) {
      continue;
    }
    Object.assign(fileEnv, parseEnvFile(readFileSync(fileName, "utf8")));
  }
  return { ...fileEnv, ...process.env };
}

function parseEnvFile(source) {
  const parsed = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    parsed[key] = stripQuotes(value);
  }
  return parsed;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function randomSuffix() {
  return randomUUID().slice(0, 8);
}

function errorMessage(error) {
  if (!error) {
    return "no error";
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object") {
    return [error.message, error.code, error.details, error.hint]
      .filter(Boolean)
      .join(" ");
  }
  return String(error);
}
