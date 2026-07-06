import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  validateForgotPasswordInput,
  validateRegisterInput,
  validateResetPasswordInput,
  validateSignInInput,
} from "./validation";
import type {
  AuthActionResult,
  AuthClient,
  AuthSession,
  AuthUser,
  ForgotPasswordInput,
  PasswordResetResult,
  RegisterInput,
  ResetPasswordInput,
  SignInInput,
} from "./types";

type SupabaseAuth = Pick<
  SupabaseClient["auth"],
  | "getSession"
  | "signInWithPassword"
  | "signUp"
  | "signOut"
  | "resetPasswordForEmail"
  | "exchangeCodeForSession"
  | "updateUser"
>;

type SupabaseAuthClientOptions = {
  supabase: { auth: SupabaseAuth };
  redirectTo?: string;
  passwordResetRedirectTo?: string;
  now?: () => string;
};

export function createSupabaseAuthClient({
  supabase,
  redirectTo,
  passwordResetRedirectTo = redirectTo,
  now = () => new Date().toISOString(),
}: SupabaseAuthClientOptions): AuthClient {
  return {
    async getCurrentSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        throw new Error(error.message);
      }

      return data.session ? toAuthSession(data.session, now) : null;
    },

    async signIn(input: SignInInput): Promise<AuthActionResult> {
      const validation = validateSignInInput(input);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: validation.value.email,
        password: validation.value.password,
      });
      if (error) {
        throw new Error(error.message);
      }
      if (!data.session) {
        throw new Error("Sign-in did not return an authenticated session.");
      }

      return {
        session: toAuthSession(data.session, now),
        message: "Signed in with Supabase Auth.",
      };
    },

    async register(input: RegisterInput): Promise<AuthActionResult> {
      const validation = validateRegisterInput(input);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      const { data, error } = await supabase.auth.signUp({
        email: validation.value.email,
        password: validation.value.password,
        options: {
          data: {
            display_name: validation.value.displayName,
          },
          emailRedirectTo: redirectTo,
        },
      });
      if (error) {
        throw new Error(error.message);
      }

      return {
        session: data.session ? toAuthSession(data.session, now) : null,
        message: data.session
          ? "Registered and signed in with Supabase Auth."
          : "Registration accepted. Check your email to confirm the account, then sign in.",
      };
    },

    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw new Error(error.message);
      }
    },

    async requestPasswordReset(
      input: ForgotPasswordInput,
    ): Promise<PasswordResetResult> {
      const validation = validateForgotPasswordInput(input);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      const { error } = await supabase.auth.resetPasswordForEmail(
        validation.value.email,
        passwordResetRedirectTo
          ? { redirectTo: passwordResetRedirectTo }
          : undefined,
      );
      if (error) {
        throw new Error(error.message);
      }

      return {
        email: validation.value.email,
        accepted: true,
        message: "Password reset email requested through Supabase Auth.",
      };
    },

    async completePasswordReset(
      input: ResetPasswordInput,
    ): Promise<AuthActionResult> {
      const validation = validateResetPasswordInput(input);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      if (validation.value.recoveryCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          validation.value.recoveryCode,
        );
        if (error) {
          throw new Error(error.message);
        }
      }

      const { error } = await supabase.auth.updateUser({
        password: validation.value.password,
      });
      if (error) {
        throw new Error(error.message);
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw new Error(sessionError.message);
      }
      if (!data.session) {
        throw new Error(
          "Password reset did not return an authenticated session.",
        );
      }

      return {
        session: toAuthSession(data.session, now),
        message: "Password updated with Supabase Auth.",
      };
    },
  };
}

function toAuthSession(session: Session, now: () => string): AuthSession {
  return {
    user: toAuthUser(session),
    establishedAt: now(),
    assurance: "server-authenticated",
  };
}

function toAuthUser(session: Session): AuthUser {
  const metadata = session.user.user_metadata;
  const displayName =
    typeof metadata.display_name === "string" && metadata.display_name.trim()
      ? metadata.display_name.trim()
      : displayNameFromEmail(session.user.email ?? session.user.id);

  return {
    id: session.user.id,
    email: session.user.email ?? "",
    displayName,
  };
}

function displayNameFromEmail(email: string) {
  return email.split("@")[0] || email;
}
