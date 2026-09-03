// Password rules confirmed by Muntajir (Chirag Technology) for
// POST /api/v1/auth/set-password, 2026-09-03:
//   - 8–128 characters
//   - at least 1 uppercase, 1 lowercase, 1 number
//   - no special character required
//   - spaces are allowed (never trim/strip before validating or submitting)
export interface PasswordRequirements {
  minLength: boolean;
  maxLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
}

export function getPasswordRequirements(password: string): PasswordRequirements {
  return {
    minLength: password.length >= 8,
    maxLength: password.length <= 128,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };
}

export function isPasswordValid(password: string): boolean {
  const requirements = getPasswordRequirements(password);
  return Object.values(requirements).every(Boolean);
}
