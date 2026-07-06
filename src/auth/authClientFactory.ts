import { createFrontendAuthClient } from "./frontendAuthClient";
import { createSupabaseAuthClient } from "./supabaseAuthClient";
import type { AuthClient } from "./types";

type BrowserEnv = Record<string, string | undefined>;

export function createConfiguredAuthClient(
  env: BrowserEnv = import.meta.env,
): AuthClient {
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

  if (isConfiguredSupabase(supabaseUrl, supabaseAnonKey)) {
    return createLazySupabaseAuthClient({
      supabaseUrl: supabaseUrl!,
      supabaseAnonKey: supabaseAnonKey!,
      redirectTo:
        typeof window === "undefined" ? undefined : window.location.origin,
    });
  }

  return createFrontendAuthClient();
}

function createLazySupabaseAuthClient({
  supabaseUrl,
  supabaseAnonKey,
  redirectTo,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  redirectTo?: string;
}): AuthClient {
  let authClientPromise: Promise<AuthClient> | null = null;
  const authClient = async () => {
    authClientPromise ??= import("@supabase/supabase-js").then(
      ({ createClient }) =>
        createSupabaseAuthClient({
          supabase: createClient(supabaseUrl, supabaseAnonKey),
          redirectTo,
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
  };
}

export function isConfiguredSupabase(
  supabaseUrl: string | undefined,
  supabaseAnonKey: string | undefined,
) {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("example-project") &&
    supabaseAnonKey !== "public-anon-key",
  );
}
