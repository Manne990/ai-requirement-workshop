import { createFrontendAuthClient } from "./frontendAuthClient";
import { createSupabaseAuthClient } from "./supabaseAuthClient";
import type { AuthClient } from "./types";
import {
  frontendAuthProductionError,
  isFrontendAuthAllowed,
} from "./authRuntimePolicy";

type BrowserEnv = Record<string, unknown>;

export function createConfiguredAuthClient(
  env: BrowserEnv = import.meta.env,
): AuthClient {
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

  if (isConfiguredSupabase(supabaseUrl, supabaseAnonKey)) {
    return createLazySupabaseAuthClient({
      supabaseUrl: supabaseUrl as string,
      supabaseAnonKey: supabaseAnonKey as string,
      redirectTo:
        typeof window === "undefined" ? undefined : window.location.origin,
      passwordResetRedirectTo:
        typeof window === "undefined"
          ? undefined
          : `${window.location.origin}?auth=reset-password`,
    });
  }

  return isFrontendAuthAllowed(env)
    ? createFrontendAuthClient()
    : createDisabledProductionAuthClient();
}

function createLazySupabaseAuthClient({
  supabaseUrl,
  supabaseAnonKey,
  redirectTo,
  passwordResetRedirectTo,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  redirectTo?: string;
  passwordResetRedirectTo?: string;
}): AuthClient {
  let authClientPromise: Promise<AuthClient> | null = null;
  const authClient = async () => {
    authClientPromise ??= import("@supabase/supabase-js").then(
      ({ createClient }) =>
        createSupabaseAuthClient({
          supabase: createClient(supabaseUrl, supabaseAnonKey),
          redirectTo,
          passwordResetRedirectTo,
        }),
    );
    return authClientPromise;
  };

  return {
    async getCurrentSession() {
      return (await authClient()).getCurrentSession();
    },
    async signIn(input) {
      return (await authClient()).signIn(input);
    },
    async register(input) {
      return (await authClient()).register(input);
    },
    async signOut() {
      return (await authClient()).signOut();
    },
    async requestPasswordReset(input) {
      return (await authClient()).requestPasswordReset(input);
    },
    async completePasswordReset(input) {
      return (await authClient()).completePasswordReset(input);
    },
  };
}

export function isConfiguredSupabase(
  supabaseUrl: unknown,
  supabaseAnonKey: unknown,
) {
  return Boolean(
    typeof supabaseUrl === "string" &&
    typeof supabaseAnonKey === "string" &&
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("example-project") &&
    supabaseAnonKey !== "public-anon-key",
  );
}

function createDisabledProductionAuthClient(): AuthClient {
  return {
    async getCurrentSession() {
      return null;
    },
    async signIn() {
      throw new Error(frontendAuthProductionError);
    },
    async register() {
      throw new Error(frontendAuthProductionError);
    },
    async signOut() {
      return;
    },
    async requestPasswordReset() {
      throw new Error(frontendAuthProductionError);
    },
    async completePasswordReset() {
      throw new Error(frontendAuthProductionError);
    },
  };
}
