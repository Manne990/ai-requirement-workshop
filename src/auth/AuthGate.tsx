import type { ReactNode } from "react";
import { AuthShell } from "./AuthShell";
import "./AuthShell.css";
import {
  frontendAuthProductionError,
  isAuthSessionAllowed,
  type AuthRuntimeEnv,
} from "./authRuntimePolicy";
import { useAuth } from "./useAuth";

type AuthGateProps = {
  children: ReactNode;
  fallback?: ReactNode;
  env?: AuthRuntimeEnv;
};

export function AuthGate({
  children,
  fallback,
  env = import.meta.env,
}: AuthGateProps) {
  const { session, isLoading } = useAuth();

  if (session && isAuthSessionAllowed(session, env)) {
    return children;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  return (
    <main className="app-shell auth-gate-shell">
      <header className="topbar" aria-label="Workshop status">
        <div>
          <p className="eyebrow">AI Requirement Workshop</p>
          <h1>Collaborative requirement room</h1>
        </div>
        <div className="topbar-actions">
          <AuthShell />
        </div>
      </header>

      <section className="auth-gate-panel" aria-label="Authentication required">
        <div>
          <p className="eyebrow">Private workspace</p>
          <h2>Sign in to open workshops</h2>
          <p>
            {session && !isAuthSessionAllowed(session, env)
              ? frontendAuthProductionError
              : "Register or sign in before entering organization workshop rooms."}
          </p>
          {isLoading ? <p>Checking account session...</p> : null}
        </div>
      </section>
    </main>
  );
}
