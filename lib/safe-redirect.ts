/**
 * Same-origin redirect targets only.
 *
 * Prefix checks alone are not enough: browsers strip tabs and newlines from
 * URLs and treat "\" like "/", so "/\t/evil.com" or "/\evil.com" turn into the
 * protocol-relative "//evil.com" after the check has passed. Reject every
 * control character and backslash outright, then let the URL parser confirm
 * the path stays on our own origin.
 */
const PROBE_ORIGIN = "https://same-origin.invalid";

export function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return false;
  try {
    return new URL(value, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
}

export function safeRelativePath(value: unknown, fallback: string): string {
  return isSafeRelativePath(value) ? value : fallback;
}
