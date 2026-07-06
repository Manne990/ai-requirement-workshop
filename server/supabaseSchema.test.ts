import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260706193000_initial_workshop_schema.sql",
  "utf8",
);

const productionTables = [
  "profiles",
  "organizations",
  "memberships",
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
});
