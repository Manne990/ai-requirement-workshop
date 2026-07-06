import { describe, expect, it } from "vitest";
import {
  createFrontendAuthClient,
  isTokenFreeSession,
} from "./frontendAuthClient";

describe("createFrontendAuthClient", () => {
  it("normalizes registration input without storing credentials or tokens", async () => {
    const client = createFrontendAuthClient({
      now: () => "2026-07-06T08:00:00.000Z",
    });

    const result = await client.register({
      displayName: "  Gaia Operator  ",
      email: "  CITIZEN@example.COM ",
      password: "stable-passphrase",
    });

    expect(result.session).not.toBeNull();
    expect(result.session!).toMatchObject({
      establishedAt: "2026-07-06T08:00:00.000Z",
      assurance: "frontend-only",
      user: {
        id: "auth-user:citizen@example.com",
        email: "citizen@example.com",
        displayName: "Gaia Operator",
      },
    });
    expect(isTokenFreeSession(result.session!)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("stable-passphrase");
  });

  it("rejects invalid sign-in input before creating a session", async () => {
    const client = createFrontendAuthClient();

    await expect(
      client.signIn({
        email: "not-an-email",
        password: "short",
      }),
    ).rejects.toThrow("Enter a valid email address.");
  });

  it("accepts password reset requests without backend calls", async () => {
    const client = createFrontendAuthClient();

    await expect(
      client.requestPasswordReset({
        email: "  reset@example.com ",
      }),
    ).resolves.toMatchObject({
      accepted: true,
      email: "reset@example.com",
    });
  });
});
