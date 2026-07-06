export type AuthMode = "signIn" | "register" | "forgotPassword";

export type AuthOperation =
  "restoreSession" | "signIn" | "register" | "signOut" | "forgotPassword";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

export type AuthSession = {
  user: AuthUser;
  establishedAt: string;
  assurance: "frontend-only" | "server-authenticated";
};

export type SignInInput = {
  email: string;
  password: string;
};

export type RegisterInput = {
  displayName: string;
  email: string;
  password: string;
};

export type ForgotPasswordInput = {
  email: string;
};

export type AuthActionResult = {
  session: AuthSession | null;
  message: string;
};

export type PasswordResetResult = {
  email: string;
  accepted: boolean;
  message: string;
};

export type AuthClient = {
  getCurrentSession: () => Promise<AuthSession | null>;
  signIn: (input: SignInInput) => Promise<AuthActionResult>;
  register: (input: RegisterInput) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (
    input: ForgotPasswordInput,
  ) => Promise<PasswordResetResult>;
};

export type AuthFieldErrors = Partial<
  Record<"displayName" | "email" | "password", string>
>;
