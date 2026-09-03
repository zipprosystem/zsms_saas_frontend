// Verified contract from Muntajir (Chirag Technology), confirmed 2026-09-03.
// This is the single place to adjust if the contract ever changes.
//
//   POST https://api.zsmsapp.com/api/v1/auth/set-password  (always this
//   base — NOT the tenant subdomain API)
//
//   Request body: exactly { token, password } — no confirmPassword,
//   email, or slug.
//
//   Success: HTTP 200, { success: true, data: { message: string } }
//
//   Errors:
//     HTTP 400, code "INVITE_INVALID"   -> invalid, expired, or already-used token
//     HTTP 422, code "VALIDATION_ERROR" -> password fails backend validation
//     anything else / network failure   -> generic error

const SET_PASSWORD_ENDPOINT = "https://api.zsmsapp.com/api/v1/auth/set-password";

export type SetPasswordResult =
  | { ok: true; serverMessage?: string }
  | { ok: false; reason: "invalid_token" }
  | { ok: false; reason: "validation_error"; serverMessage?: string }
  | { ok: false; reason: "network_error" }
  | { ok: false; reason: "unknown_error" };

interface SetPasswordSuccessBody {
  success: true;
  data?: { message?: string };
}

interface SetPasswordErrorBody {
  success?: false;
  code?: string;
  message?: string;
}

function isSuccessBody(body: unknown): body is SetPasswordSuccessBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "success" in body &&
    (body as { success?: unknown }).success === true
  );
}

function isErrorBody(body: unknown): body is SetPasswordErrorBody {
  return typeof body === "object" && body !== null;
}

export async function setPassword(token: string, password: string): Promise<SetPasswordResult> {
  let response: Response;
  try {
    response = await fetch(SET_PASSWORD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  if (response.status === 400 && errorBody?.code === "INVITE_INVALID") {
    return { ok: false, reason: "invalid_token" };
  }

  if (response.status === 422 && errorBody?.code === "VALIDATION_ERROR") {
    return { ok: false, reason: "validation_error", serverMessage: errorBody.message };
  }

  return { ok: false, reason: "unknown_error" };
}
