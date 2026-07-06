import { createContext } from "react";
import type {
  AuthActionResult,
  AuthOperation,
  AuthSession,
  ForgotPasswordInput,
  RegisterInput,
  ResetPasswordInput,
  SignInInput,
} from "./types";

export type AuthContextValue = {
  session: AuthSession | null;
  isLoading: boolean;
  activeOperation: AuthOperation | null;
  error: string | null;
  notice: string | null;
  signIn: (input: SignInInput) => Promise<AuthActionResult>;
  register: (input: RegisterInput) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (input: ForgotPasswordInput) => Promise<void>;
  completePasswordReset: (
    input: ResetPasswordInput,
  ) => Promise<AuthActionResult>;
  clearAuthMessage: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
