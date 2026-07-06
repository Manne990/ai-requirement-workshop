import type { Session } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseAuthClient } from "./supabaseAuthClient";

describe("createSupabaseAuthClient", () => {
  it("signs in with Supabase Auth and maps the server session", async () => {
    const session = createSession({
      userId: "user-123",
      email: "user@example.com",
      displayName: "Requirement Owner",
    });
    const signInWithPassword = vi.fn(async () => ({
      data: { user: session.user, session },
      error: null,
    }));
    const client = createSupabaseAuthClient({
      supabase: {
        auth: {
          getSession: vi.fn(),
          signInWithPassword,
          signUp: vi.fn(),
          signOut: vi.fn(),
          resetPasswordForEmail: vi.fn(),
          exchangeCodeForSession: vi.fn(),
          updateUser: vi.fn(),
        },
      },
      now: () => "2026-07-06T09:00:00.000Z",
    });

    await expect(
      client.signIn({
        email: " USER@example.com ",
        password: "production-passphrase",
      }),
    ).resolves.toMatchObject({
      session: {
        establishedAt: "2026-07-06T09:00:00.000Z",
        assurance: "server-authenticated",
        user: {
          id: "user-123",
          email: "user@example.com",
          displayName: "Requirement Owner",
        },
      },
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "production-passphrase",
    });
  });

  it("keeps registration pending when Supabase requires email confirmation", async () => {
    const signUp = vi.fn(async () => ({
      data: { user: null, session: null },
      error: null,
    }));
    const client = createSupabaseAuthClient({
      supabase: {
        auth: {
          getSession: vi.fn(),
          signInWithPassword: vi.fn(),
          signUp,
          signOut: vi.fn(),
          resetPasswordForEmail: vi.fn(),
          exchangeCodeForSession: vi.fn(),
          updateUser: vi.fn(),
        },
      },
      redirectTo: "https://workshop.example",
    });

    await expect(
      client.register({
        displayName: "SOS Facilitator",
        email: "facilitator@example.com",
        password: "production-passphrase",
      }),
    ).resolves.toMatchObject({
      session: null,
      message: expect.stringMatching(/check your email/i),
    });
    expect(signUp).toHaveBeenCalledWith({
      email: "facilitator@example.com",
      password: "production-passphrase",
      options: {
        data: { display_name: "SOS Facilitator" },
        emailRedirectTo: "https://workshop.example",
      },
    });
  });

  it("requests password reset through Supabase without exposing credentials", async () => {
    const resetPasswordForEmail = vi.fn(async () => ({
      data: {},
      error: null,
    }));
    const client = createSupabaseAuthClient({
      supabase: {
        auth: {
          getSession: vi.fn(),
          signInWithPassword: vi.fn(),
          signUp: vi.fn(),
          signOut: vi.fn(),
          resetPasswordForEmail,
          exchangeCodeForSession: vi.fn(),
          updateUser: vi.fn(),
        },
      },
      redirectTo: "https://workshop.example",
    });

    await expect(
      client.requestPasswordReset({ email: " RESET@example.com " }),
    ).resolves.toMatchObject({
      accepted: true,
      email: "reset@example.com",
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("reset@example.com", {
      redirectTo: "https://workshop.example",
    });
  });

  it("exchanges a recovery code and updates the password through Supabase", async () => {
    const session = createSession({
      userId: "reset-user-123",
      email: "reset@example.com",
      displayName: "Reset Owner",
    });
    const exchangeCodeForSession = vi.fn(async () => ({
      data: { user: session.user, session },
      error: null,
    }));
    const updateUser = vi.fn(async () => ({
      data: { user: session.user },
      error: null,
    }));
    const getSession = vi.fn(async () => ({
      data: { session },
      error: null,
    }));
    const client = createSupabaseAuthClient({
      supabase: {
        auth: {
          getSession,
          signInWithPassword: vi.fn(),
          signUp: vi.fn(),
          signOut: vi.fn(),
          resetPasswordForEmail: vi.fn(),
          exchangeCodeForSession,
          updateUser,
        },
      },
      now: () => "2026-07-06T10:30:00.000Z",
    });

    await expect(
      client.completePasswordReset({
        password: "updated-passphrase",
        recoveryCode: "recovery-code-123",
      }),
    ).resolves.toMatchObject({
      session: {
        establishedAt: "2026-07-06T10:30:00.000Z",
        assurance: "server-authenticated",
        user: {
          id: "reset-user-123",
          email: "reset@example.com",
          displayName: "Reset Owner",
        },
      },
    });
    expect(exchangeCodeForSession).toHaveBeenCalledWith("recovery-code-123");
    expect(updateUser).toHaveBeenCalledWith({
      password: "updated-passphrase",
    });
  });
});

function createSession({
  userId,
  email,
  displayName,
}: {
  userId: string;
  email: string;
  displayName: string;
}) {
  return {
    access_token: "redacted-access-token",
    refresh_token: "redacted-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    user: {
      id: userId,
      email,
      user_metadata: {
        display_name: displayName,
      },
      app_metadata: {},
      aud: "authenticated",
      created_at: "2026-07-06T08:55:00.000Z",
    },
  } as Session;
}
