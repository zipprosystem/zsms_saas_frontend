// Client-side validation + base64 conversion for the School Logo upload
// (POST {API_BASE}/school/settings/logo). Only the main school logo has a
// working upload path — see BrandingPanel for the other 3 (deferred) slots.

export const ALLOWED_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

// 2MB, decoded — checked against File.size (the raw byte size), not the
// ~33% larger base64-encoded string length.
export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

export type LogoFileValidation = { ok: true } | { ok: false; reason: "unsupportedType" | "tooLarge" };

export function validateLogoFile(file: File): LogoFileValidation {
  if (!(ALLOWED_LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "unsupportedType" };
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return { ok: false, reason: "tooLarge" };
  }
  return { ok: true };
}

// Strips the "data:image/png;base64," prefix FileReader's data URL includes
// — the contract wants pure base64 content in content_base64.
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected FileReader result"));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}
