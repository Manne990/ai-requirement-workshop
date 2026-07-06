import {
  validateForgotPasswordInput,
  validateRegisterInput,
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
  SignInInput,
} from "./types";

type FrontendAuthClientOptions = {
  now?: () => string;
};

export function createFrontendAuthClient(
  options: FrontendAuthClientOptions = {},
): AuthClient {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async getCurrentSession() {
      return null;
    },

    async signIn(input: SignInInput) {
      const validation = validateSignInInput(input);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      return createAuthActionResult({
        email: validation.value.email,
        displayName: displayNameFromEmail(validation.value.email),
        now,
        message:
          "Signed in with the frontend auth adapter. No server session was created.",
      });
    },

    async register(input: RegisterInput) {
      const validation = validateRegisterInput(input);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      return createAuthActionResult({
        email: validation.value.email,
        displayName: validation.value.displayName,
        now,
        message:
          "Registered in the frontend auth adapter. No account was stored.",
      });
    },

    async signOut() {
      return;
    },

    async requestPasswordReset(
      input: ForgotPasswordInput,
    ): Promise<PasswordResetResult> {
      const validation = validateForgotPasswordInput(input);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      return {
        email: validation.value.email,
        accepted: true,
        message:
          "Password reset request accepted by the frontend auth adapter.",
      };
    },
  };
}

function createAuthActionResult({
  email,
  displayName,
  now,
  message,
}: {
  email: string;
  displayName: string;
  now: () => string;
  message: string;
}): AuthActionResult {
  return {
    session: {
      user: createUser(email, displayName),
      establishedAt: now(),
      assurance: "frontend-only",
    },
    message,
  };
}

function createUser(email: string, displayName: string): AuthUser {
  return {
    id: `auth-user:${email}`,
    email,
    displayName,
  };
}

function displayNameFromEmail(email: string) {
  return email.split("@")[0] || email;
}

export function isTokenFreeSession(session: AuthSession) {
  return !("token" in session) && !("accessToken" in session);
}
