// Verified contract from Muntajir (Chirag Technology), confirmed 2026-09-08.
//
//   POST {API_BASE}/auth/reset-password
//   Request body: exactly { token, password } — no confirmPassword, email,
//   or slug.
//
//   Success: HTTP 200, { success: true, data: { message: string } }
//
//   Errors:
//     HTTP 400 -> invalid, expired, or already-used token
//     HTTP 422 -> password fails backend validation
//     anything else / network failure -> generic error
//
//   TODO: set-password's equivalent endpoint returns a specific error code
//   ("INVITE_INVALID") we can match on instead of just the status. Tighten
//   the 400 branch below to check `code` once Muntajir confirms the
//   equivalent code for reset-password (likely something like
//   "RESET_TOKEN_INVALID").
import { API_BASE } from "@/lib/api/config";

export type ResetPasswordResult =
  | { ok: true; serverMessage?: string }
  | { ok: false; reason: "invalid_token" }
  | { ok: false; reason: "validation_error"; serverMessage?: string }
  | { ok: false; reason: "network_error" }
  | { ok: false; reason: "unknown_error" };

interface ResetPasswordSuccessBody {
  success: true;
  data?: { message?: string };
}

interface ResetPasswordErrorBody {
  success?: false;
  code?: string;
  message?: string;
}

function isSuccessBody(body: unknown): body is ResetPasswordSuccessBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "success" in body &&
    (body as { success?: unknown }).success === true
  );
}

function isErrorBody(body: unknown): body is ResetPasswordErrorBody {
  return typeof body === "object" && body !== null;
}

export async function resetPassword(token: string, password: string): Promise<ResetPasswordResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, password }),
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok && isSuccessBody(body)) {
    return { ok: true, serverMessage: body.data?.message };
  }

  const errorBody = isErrorBody(body) ? body : undefined;

  if (response.status === 400) {
    return { ok: false, reason: "invalid_token" };
  }

  if (response.status === 422) {
    return { ok: false, reason: "validation_error", serverMessage: errorBody?.message };
  }

  return { ok: false, reason: "unknown_error" };
}
