import type { AuthSession } from "./types";

export type AuthRuntimeEnv = Record<string, unknown>;

export const frontendAuthProductionError =
  "Production authentication requires a server-authenticated Supabase session.";

export function isFrontendAuthAllowed(env: AuthRuntimeEnv = import.meta.env) {
  return (
    !isProductionRuntime(env) ||
    readBoolean(env.VITE_ALLOW_FRONTEND_AUTH_IN_PRODUCTION)
  );
}

export function isAuthSessionAllowed(
  session: AuthSession,
  env: AuthRuntimeEnv = import.meta.env,
) {
  return (
    session.assurance === "server-authenticated" || isFrontendAuthAllowed(env)
  );
}

export function isProductionRuntime(env: AuthRuntimeEnv = import.meta.env) {
  return readBoolean(env.PROD) || env.MODE === "production";
}

function readBoolean(value: unknown) {
  return value === true || value === "true";
}
