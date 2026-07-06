import {
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import "./AuthShell.css";
import type { AuthFieldErrors, AuthMode } from "./types";
import { useAuth } from "./useAuth";
import {
  validateForgotPasswordInput,
  validateRegisterInput,
  validateSignInInput,
} from "./validation";

type AuthFormState = {
  displayName: string;
  email: string;
  password: string;
};

const initialFormState: AuthFormState = {
  displayName: "",
  email: "",
  password: "",
};

const modeLabels: Record<AuthMode, string> = {
  signIn: "Sign in",
  register: "Register",
  forgotPassword: "Forgot password",
};

export function AuthShell() {
  const { session, isLoading, activeOperation, signOut } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const displayName = session?.user.displayName ?? "Account";

  if (session) {
    return (
      <div className="auth-account" aria-label="Signed-in account">
        <div>
          <UserRound aria-hidden="true" size={16} />
          <span>{displayName}</span>
        </div>
        <button
          className="ghost-button auth-action-button"
          type="button"
          onClick={() => void signOut()}
          disabled={activeOperation === "signOut"}
        >
          <LogOut aria-hidden="true" size={16} />
          {activeOperation === "signOut" ? "Signing out" : "Sign out"}
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        className="ghost-button auth-action-button"
        type="button"
        onClick={() => setIsDialogOpen(true)}
        disabled={isLoading}
      >
        <LogIn aria-hidden="true" size={18} />
        {isLoading ? "Checking account" : "Sign in"}
      </button>

      {isDialogOpen ? (
        <AuthDialog onClose={() => setIsDialogOpen(false)} />
      ) : null}
    </>
  );
}

function AuthDialog({ onClose }: { onClose: () => void }) {
  const {
    activeOperation,
    error,
    notice,
    signIn,
    register,
    requestPasswordReset,
    clearAuthMessage,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [formState, setFormState] = useState<AuthFormState>(initialFormState);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const isSubmitting = activeOperation === modeToOperation(mode);

  const submitLabel = useMemo(() => {
    if (isSubmitting) {
      return mode === "forgotPassword" ? "Sending" : "Submitting";
    }

    return modeLabels[mode];
  }, [isSubmitting, mode]);

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFieldErrors({});
    clearAuthMessage();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode === "signIn") {
      const validation = validateSignInInput(formState);
      setFieldErrors(validation.fieldErrors);
      if (!validation.ok) {
        return;
      }

      try {
        const result = await signIn(validation.value);
        if (result.session) {
          onClose();
        }
      } catch {
        return;
      }
      return;
    }

    if (mode === "register") {
      const validation = validateRegisterInput(formState);
      setFieldErrors(validation.fieldErrors);
      if (!validation.ok) {
        return;
      }

      try {
        const result = await register(validation.value);
        if (result.session) {
          onClose();
        }
      } catch {
        return;
      }
      return;
    }

    const validation = validateForgotPasswordInput(formState);
    setFieldErrors(validation.fieldErrors);
    if (!validation.ok) {
      return;
    }

    try {
      await requestPasswordReset(validation.value);
    } catch {
      return;
    }
  };

  return (
    <aside
      className="auth-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Authentication"
    >
      <div className="auth-dialog-header">
        <div>
          <p className="eyebrow">Access</p>
          <h2>{modeLabels[mode]}</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close authentication"
          onClick={onClose}
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>

      <div className="auth-mode-control" aria-label="Authentication mode">
        <button
          type="button"
          className={mode === "signIn" ? "active" : ""}
          aria-pressed={mode === "signIn"}
          onClick={() => handleModeChange("signIn")}
        >
          <LogIn aria-hidden="true" size={16} />
          Sign in
        </button>
        <button
          type="button"
          className={mode === "register" ? "active" : ""}
          aria-pressed={mode === "register"}
          onClick={() => handleModeChange("register")}
        >
          <UserPlus aria-hidden="true" size={16} />
          Register
        </button>
        <button
          type="button"
          className={mode === "forgotPassword" ? "active" : ""}
          aria-pressed={mode === "forgotPassword"}
          onClick={() => handleModeChange("forgotPassword")}
        >
          <KeyRound aria-hidden="true" size={16} />
          Reset
        </button>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === "register" ? (
          <label>
            <span>Display name</span>
            <input
              type="text"
              autoComplete="name"
              value={formState.displayName}
              aria-invalid={Boolean(fieldErrors.displayName)}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
            />
            {fieldErrors.displayName ? (
              <small>{fieldErrors.displayName}</small>
            ) : null}
          </label>
        ) : null}

        <label>
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={formState.email}
            aria-invalid={Boolean(fieldErrors.email)}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
          />
          {fieldErrors.email ? <small>{fieldErrors.email}</small> : null}
        </label>

        {mode !== "forgotPassword" ? (
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              value={formState.password}
              aria-invalid={Boolean(fieldErrors.password)}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
            />
            {fieldErrors.password ? (
              <small>{fieldErrors.password}</small>
            ) : null}
          </label>
        ) : null}

        <div className="auth-adapter-status">
          <ShieldCheck aria-hidden="true" size={16} />
          <span>Frontend adapter</span>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-notice">{notice}</p> : null}

        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting}
        >
          <Mail aria-hidden="true" size={18} />
          {submitLabel}
        </button>
      </form>
    </aside>
  );
}

function modeToOperation(mode: AuthMode) {
  return mode === "forgotPassword" ? "forgotPassword" : mode;
}
