import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AuthContext, type AuthContextValue } from "./AuthContext";
import { createConfiguredAuthClient } from "./authClientFactory";
import type {
  AuthClient,
  AuthOperation,
  AuthSession,
  ForgotPasswordInput,
  RegisterInput,
  ResetPasswordInput,
  SignInInput,
} from "./types";

type AuthProviderProps = {
  children: ReactNode;
  client?: AuthClient;
  initialSession?: AuthSession | null;
};

const defaultAuthClient = createConfiguredAuthClient();

export function AuthProvider({
  children,
  client = defaultAuthClient,
  initialSession,
}: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(
    initialSession ?? null,
  );
  const [isLoading, setIsLoading] = useState(initialSession === undefined);
  const [activeOperation, setActiveOperation] = useState<AuthOperation | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialSession !== undefined) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setActiveOperation("restoreSession");
    client
      .getCurrentSession()
      .then((restoredSession) => {
        if (isMounted) {
          setSession(restoredSession);
          setError(null);
        }
      })
      .catch((restoreError: unknown) => {
        if (isMounted) {
          setError(authErrorMessage(restoreError));
        }
      })
      .finally(() => {
        if (isMounted) {
          setActiveOperation(null);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, initialSession]);

  const clearAuthMessage = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const signIn = useCallback(
    async (input: SignInInput) => {
      setActiveOperation("signIn");
      clearAuthMessage();

      try {
        const result = await client.signIn(input);
        setSession(result.session);
        setNotice(result.message);
        return result;
      } catch (signInError) {
        const message = authErrorMessage(signInError);
        setError(message);
        throw new Error(message);
      } finally {
        setActiveOperation(null);
      }
    },
    [clearAuthMessage, client],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      setActiveOperation("register");
      clearAuthMessage();

      try {
        const result = await client.register(input);
        setSession(result.session);
        setNotice(result.message);
        return result;
      } catch (registerError) {
        const message = authErrorMessage(registerError);
        setError(message);
        throw new Error(message);
      } finally {
        setActiveOperation(null);
      }
    },
    [clearAuthMessage, client],
  );

  const signOut = useCallback(async () => {
    setActiveOperation("signOut");
    clearAuthMessage();

    try {
      await client.signOut();
      setSession(null);
      setNotice("Signed out.");
    } catch (signOutError) {
      const message = authErrorMessage(signOutError);
      setError(message);
      throw new Error(message);
    } finally {
      setActiveOperation(null);
    }
  }, [clearAuthMessage, client]);

  const requestPasswordReset = useCallback(
    async (input: ForgotPasswordInput) => {
      setActiveOperation("forgotPassword");
      clearAuthMessage();

      try {
        const result = await client.requestPasswordReset(input);
        setNotice(result.message);
      } catch (resetError) {
        const message = authErrorMessage(resetError);
        setError(message);
        throw new Error(message);
      } finally {
        setActiveOperation(null);
      }
    },
    [clearAuthMessage, client],
  );

  const completePasswordReset = useCallback(
    async (input: ResetPasswordInput) => {
      setActiveOperation("resetPassword");
      clearAuthMessage();

      try {
        const result = await client.completePasswordReset(input);
        setSession(result.session);
        setNotice(result.message);
        return result;
      } catch (resetError) {
        const message = authErrorMessage(resetError);
        setError(message);
        throw new Error(message);
      } finally {
        setActiveOperation(null);
      }
    },
    [clearAuthMessage, client],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      activeOperation,
      error,
      notice,
      signIn,
      register,
      signOut,
      requestPasswordReset,
      completePasswordReset,
      clearAuthMessage,
    }),
    [
      activeOperation,
      clearAuthMessage,
      completePasswordReset,
      error,
      isLoading,
      notice,
      register,
      requestPasswordReset,
      session,
      signIn,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function authErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Authentication failed.";
}
