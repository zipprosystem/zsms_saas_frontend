// Shared by every settings panel with an optional URL field (Identity's
// website, Social Media's facebook/instagram/youtube/twitter) — a plausible
// http(s) URL with a dotted host. Deliberately loose; the backend is the
// real authority. Empty is handled by the caller (empty always passes).
export function isPlausibleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}
