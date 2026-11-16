import { isSafeRelativePath } from "./safe-redirect";

/**
 * Avatar-Adressen aus Formularen: nur http(s)-URLs oder eigene Upload-Pfade
 * (`/api/media/…`, im Dev-Fallback `/uploads/…`). Alles andere — `javascript:`,
 * `data:`, protokoll-relative oder fremde Pfade — wird zu `null`.
 */
export function sanitizeAvatarUrl(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value.length > 2048) return null;
  if (value.startsWith("/")) {
    return isSafeRelativePath(value) &&
      !value.includes("..") &&
      (value.startsWith("/api/media/") || value.startsWith("/uploads/"))
      ? value
      : null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
