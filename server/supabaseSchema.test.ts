import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationDir = "supabase/migrations";
const migration = readdirSync(migrationDir)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => readFileSync(`${migrationDir}/${fileName}`, "utf8"))
  .join("\n");

const productionTables = [
  "profiles",
  "organizations",
  "memberships",
  "organization_invites",
  "workshops",
  "workshop_participants",
  "messages",
  "artifacts",
  "artifact_links",
  "requirements",
  "approvals",
  "prototypes",
  "attachments",
  "audit_events",
  "read_states",
];

describe("Supabase production schema migration", () => {
  it("declares every required production table", () => {
    for (const table of productionTables) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }
  });

  it("enables row level security for every production table", () => {
    for (const table of productionTables) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("defines at least one policy for every production table", () => {
    for (const table of productionTables) {
      expect(migration).toMatch(
        new RegExp(`create policy [\\s\\S]+ on public\\.${table}\\b`),
      );
    }
  });

  it("keeps service-role assumptions out of the browser-facing schema", () => {
    expect(migration).not.toMatch(/service_role/i);
    expect(migration).toContain("auth.uid()");
  });

  it("uses the production organization roles and invite-token boundary", () => {
    expect(migration).toContain("'owner'");
    expect(migration).toContain("'facilitator'");
    expect(migration).toContain("'participant'");
    expect(migration).toContain("'viewer'");
    expect(migration).not.toContain("'contributor'");
    expect(migration).not.toContain("'reviewer'");
    expect(migration).toContain("token_hash text not null unique");
  });

  it("stores durable workshop snapshots for resumable sessions", () => {
    expect(migration).toContain("record_key text");
    expect(migration).toContain("session_snapshot jsonb");
    expect(migration).toContain("seen_insight_ids_by_participant jsonb");
    expect(migration).toContain("workshops_org_record_key_idx");
  });

  it("allows a new authenticated user to bootstrap the first owner membership", () => {
    expect(migration).toContain("memberships_creator_owner_bootstrap");
    expect(migration).toContain("organizations.created_by = auth.uid()");
  });
});
