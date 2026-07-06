import { describe, expect, it } from "vitest";
import {
  createConfiguredAuthClient,
  isConfiguredSupabase,
} from "./authClientFactory";
import { frontendAuthProductionError } from "./authRuntimePolicy";

describe("isConfiguredSupabase", () => {
  it("treats placeholder env values as local frontend auth", () => {
    expect(
      isConfiguredSupabase(
        "https://example-project.supabase.co",
        "public-anon-key",
      ),
    ).toBe(false);
    expect(isConfiguredSupabase(undefined, "anon")).toBe(false);
    expect(isConfiguredSupabase("https://project.supabase.co", "")).toBe(false);
  });

  it("requires a real browser-safe Supabase URL and anon key", () => {
    expect(
      isConfiguredSupabase("https://real-project.supabase.co", "anon-key"),
    ).toBe(true);
  });

  it("fails closed instead of creating frontend-only auth in production", async () => {
    const client = createConfiguredAuthClient({
      PROD: true,
      MODE: "production",
      VITE_SUPABASE_URL: "https://example-project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "public-anon-key",
    });

    await expect(
      client.signIn({
        email: "owner@example.com",
        password: "production-passphrase",
      }),
    ).rejects.toThrow(frontendAuthProductionError);
  });

  it("allows explicit frontend auth production escape hatch for non-production demos", async () => {
    const client = createConfiguredAuthClient({
      PROD: true,
      MODE: "production",
      VITE_ALLOW_FRONTEND_AUTH_IN_PRODUCTION: "true",
    });

    await expect(
      client.register({
        displayName: "Demo Owner",
        email: "owner@example.com",
        password: "demo-passphrase",
      }),
    ).resolves.toMatchObject({
      session: { assurance: "frontend-only" },
    });
  });
});
