import { describe, expect, it } from "vitest";
import { isConfiguredSupabase } from "./authClientFactory";

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
});
