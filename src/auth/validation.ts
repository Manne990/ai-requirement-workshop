import type {
  AuthFieldErrors,
  ForgotPasswordInput,
  RegisterInput,
  ResetPasswordInput,
  SignInInput,
} from "./types";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const minimumPasswordLength = 8;

export type ValidationResult<TInput> =
  | {
      ok: true;
      value: TInput;
      fieldErrors: AuthFieldErrors;
    }
  | {
      ok: false;
      fieldErrors: AuthFieldErrors;
      message: string;
    };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateSignInInput(
  input: SignInInput,
): ValidationResult<SignInInput> {
  const value = {
    email: normalizeEmail(input.email),
    password: input.password,
  };
  const fieldErrors: AuthFieldErrors = {
    ...validateEmail(value.email),
    ...validatePassword(value.password),
  };

  return toValidationResult(value, fieldErrors);
}

export function validateRegisterInput(
  input: RegisterInput,
): ValidationResult<RegisterInput> {
  const value = {
    displayName: input.displayName.trim(),
    email: normalizeEmail(input.email),
    password: input.password,
  };
  const fieldErrors: AuthFieldErrors = {
    ...validateDisplayName(value.displayName),
    ...validateEmail(value.email),
    ...validatePassword(value.password),
  };

  return toValidationResult(value, fieldErrors);
}

export function validateForgotPasswordInput(
  input: ForgotPasswordInput,
): ValidationResult<ForgotPasswordInput> {
  const value = {
    email: normalizeEmail(input.email),
  };
  const fieldErrors = validateEmail(value.email);

  return toValidationResult(value, fieldErrors);
}

export function validateResetPasswordInput(
  input: ResetPasswordInput,
): ValidationResult<ResetPasswordInput> {
  const value = {
    password: input.password,
    recoveryCode: input.recoveryCode,
    recoveryEmail: input.recoveryEmail
      ? normalizeEmail(input.recoveryEmail)
      : undefined,
  };
  const fieldErrors = validatePassword(value.password);

  return toValidationResult(value, fieldErrors);
}

export function firstAuthFieldError(fieldErrors: AuthFieldErrors) {
  return fieldErrors.displayName ?? fieldErrors.email ?? fieldErrors.password;
}

function validateDisplayName(displayName: string): AuthFieldErrors {
  if (!displayName) {
    return { displayName: "Enter a display name." };
  }

  if (displayName.length < 2) {
    return { displayName: "Display name must be at least 2 characters." };
  }

  return {};
}

function validateEmail(email: string): AuthFieldErrors {
  if (!email) {
    return { email: "Enter an email address." };
  }

  if (!emailPattern.test(email)) {
    return { email: "Enter a valid email address." };
  }

  return {};
}

function validatePassword(password: string): AuthFieldErrors {
  if (!password) {
    return { password: "Enter a password." };
  }

  if (password.length < minimumPasswordLength) {
    return {
      password: `Password must be at least ${minimumPasswordLength} characters.`,
    };
  }

  return {};
}

function toValidationResult<TInput>(
  value: TInput,
  fieldErrors: AuthFieldErrors,
): ValidationResult<TInput> {
  const message = firstAuthFieldError(fieldErrors);

  if (message) {
    return {
      ok: false,
      fieldErrors,
      message,
    };
  }

  return {
    ok: true,
    value,
    fieldErrors,
  };
}
