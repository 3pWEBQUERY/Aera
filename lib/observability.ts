type LogLevel = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SENSITIVE_KEY = /(?:authorization|cookie|password|secret|token|key|email|payload|body)/i;
const CREDENTIAL_URL = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SECRET_QUERY = /([?&](?:access_token|api_key|key|password|secret|signature|token)=)[^&#\s]+/gi;
const KNOWN_SECRET = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|\bwhsec_[A-Za-z0-9]+|\bre_[A-Za-z0-9_-]{10,}/g;

function cleanString(value: string, maxLength = 8_000): string {
  return value
    .replace(CREDENTIAL_URL, "$1[redacted]@")
    .replace(BEARER, "Bearer [redacted]")
    .replace(SECRET_QUERY, "$1[redacted]")
    .replace(KNOWN_SECRET, "[redacted]")
    .slice(0, maxLength);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return cleanString(value, depth === 0 ? 1_000 : 250);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (depth >= 3) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Fields = {};
    for (const [key, nested] of Object.entries(value).slice(0, 50)) {
      result[key] = SENSITIVE_KEY.test(key)
        ? "[redacted]"
        : sanitizeValue(nested, depth + 1);
    }
    return result;
  }
  return cleanString(String(value), 250);
}

function sanitizeFields(fields: Fields): Fields {
  const result: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeValue(value, 0);
  }
  return result;
}

function baseRecord(level: LogLevel, event: string): Fields {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: process.env.RAILWAY_SERVICE_NAME ?? "aera-web",
    environment:
      process.env.AERA_ENVIRONMENT ?? process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV,
    release:
      process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.SOURCE_VERSION ?? "unknown",
  };
}

/** One-line structured logs are ingestible by Railway and any JSON log drain. */
export function logOperationalEvent(
  level: LogLevel,
  event: string,
  fields: Fields = {},
): void {
  const record = JSON.stringify({ ...baseRecord(level, event), ...sanitizeFields(fields) });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.info(record);
}

export function reportError(error: unknown, fields: Fields = {}): void {
  const normalized = error instanceof Error ? error : new Error(String(error));
  logOperationalEvent("error", "unhandled_request_error", {
    ...fields,
    errorName: normalized.name,
    errorMessage: cleanString(normalized.message, 1_000),
    errorStack: cleanString(normalized.stack ?? "", 8_000),
  });
}
