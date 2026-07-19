/** Pure, side-effect-free environment validation for runtime, CI and tests. */

export type EnvironmentProfile = "development" | "ci" | "production";
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export class EnvironmentValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid Aera environment:\n- ${issues.join("\n- ")}`);
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

function get(source: EnvironmentSource, key: string): string {
  return (source[key] ?? "").trim();
}

function looksLikePlaceholder(value: string): boolean {
  return /(?:change[-_ ]?me|replace[-_ ]?me|your[-_ ]|password|base64_|\.\.\.|example)/i.test(
    value,
  );
}

function parseUrl(
  source: EnvironmentSource,
  key: string,
  protocols: readonly string[],
  issues: string[],
  required: boolean,
): URL | null {
  const raw = get(source, key);
  if (!raw) {
    if (required) issues.push(`${key}: is required`);
    return null;
  }
  try {
    const parsed = new URL(raw);
    if (!protocols.includes(parsed.protocol)) {
      issues.push(`${key}: must use ${protocols.join(" or ")}`);
      return null;
    }
    return parsed;
  } catch {
    issues.push(`${key}: must be a valid URL`);
    return null;
  }
}

function requireSecret(
  source: EnvironmentSource,
  key: string,
  minLength: number,
  issues: string[],
  required: boolean,
  prefix?: string,
): string {
  const raw = get(source, key);
  if (!raw) {
    if (required) issues.push(`${key}: is required`);
    return raw;
  }
  if (raw.length < minLength || looksLikePlaceholder(raw)) {
    issues.push(`${key}: must be a non-placeholder value with at least ${minLength} characters`);
  }
  if (prefix && !raw.startsWith(prefix)) {
    issues.push(`${key}: must start with ${prefix}`);
  }
  return raw;
}

function validateKeyring(raw: string, issues: string[], required: boolean): void {
  if (!raw) {
    if (required) issues.push("AERA_DATA_ENCRYPTION_KEYS: is required");
    return;
  }
  const seen = new Set<string>();
  const entries = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (entries.length === 0) {
    issues.push("AERA_DATA_ENCRYPTION_KEYS: must contain at least one key");
    return;
  }
  for (const entry of entries) {
    const separator = entry.indexOf(":");
    const id = separator > 0 ? entry.slice(0, separator) : "";
    const encoded = separator > 0 ? entry.slice(separator + 1) : "";
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
      issues.push("AERA_DATA_ENCRYPTION_KEYS: contains an invalid key id");
      continue;
    }
    if (seen.has(id)) {
      issues.push("AERA_DATA_ENCRYPTION_KEYS: contains a duplicate key id");
      continue;
    }
    seen.add(id);
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length !== 32 || bytes.toString("base64") !== encoded) {
      issues.push("AERA_DATA_ENCRYPTION_KEYS: every key must be canonical base64 for 32 bytes");
    }
  }
}

function validateCompleteGroup(
  source: EnvironmentSource,
  keys: readonly string[],
  issues: string[],
  required: boolean,
): boolean {
  const configured = keys.filter((key) => Boolean(get(source, key)));
  if (required && configured.length !== keys.length) {
    for (const key of keys) if (!get(source, key)) issues.push(`${key}: is required`);
    return false;
  }
  if (!required && configured.length > 0 && configured.length !== keys.length) {
    for (const key of keys) {
      if (!get(source, key)) issues.push(`${key}: is required when this integration is configured`);
    }
    return false;
  }
  return configured.length === keys.length;
}

/**
 * Validate an environment without returning or logging any secret values.
 *
 * Contract ("progressive integrations"): only the variables the app cannot
 * run without at all are hard requirements — the database, the auth secret
 * and the public origin. Every integration (Stripe, Resend, S3, Redis,
 * ClamAV, encryption keyring, cron, resolver origin) stays optional in every
 * profile, exactly like the runtime treats it: absent means the feature is
 * off. What IS enforced everywhere: configured values must be well-formed,
 * and grouped integrations must be complete so features cannot become
 * half-enabled.
 */
export function validateEnvironment(
  source: EnvironmentSource,
  profile: EnvironmentProfile = "production",
): void {
  const issues: string[] = [];
  const strict = profile === "production" || profile === "ci";

  const database = parseUrl(
    source,
    "DATABASE_URL",
    ["postgres:", "postgresql:"],
    issues,
    strict,
  );
  if (database && looksLikePlaceholder(database.hostname)) {
    issues.push("DATABASE_URL: contains a placeholder host");
  }
  if (database && strict && (!database.username || !database.password)) {
    issues.push("DATABASE_URL: must include database credentials in production");
  }

  requireSecret(source, "AUTH_SECRET", 32, issues, strict);
  // Optional hardening: features degrade gracefully when these are absent
  // (TOTP secrets refuse to store, cron endpoints reject requests).
  validateKeyring(get(source, "AERA_DATA_ENCRYPTION_KEYS"), issues, false);
  requireSecret(source, "CRON_SECRET", 32, issues, false);

  // Mirror the runtime normalisation in lib/env.ts: the app strips scheme,
  // path and port before using the value, so a scheme-prefixed variable is
  // tolerated configuration — not a deployment error.
  const rootDomain = get(source, "NEXT_PUBLIC_ROOT_DOMAIN")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/:].*$/, "");
  if (!rootDomain) {
    if (strict) issues.push("NEXT_PUBLIC_ROOT_DOMAIN: is required");
  } else if (
    !(rootDomain === "localhost" && !strict) &&
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      rootDomain,
    )
  ) {
    issues.push("NEXT_PUBLIC_ROOT_DOMAIN: must be a valid non-local hostname");
  }

  const appUrl = parseUrl(source, "APP_URL", ["https:", "http:"], issues, strict);
  if (appUrl) {
    if (strict && appUrl.protocol !== "https:") issues.push("APP_URL: must use https in production");
    if (strict && (appUrl.hostname === "localhost" || appUrl.hostname === "127.0.0.1")) {
      issues.push("APP_URL: must not point to localhost in production");
    }
    if (appUrl.pathname !== "/" || appUrl.search || appUrl.hash || appUrl.username || appUrl.password) {
      issues.push("APP_URL: must be an origin without credentials, path, query or fragment");
    }
    if (
      strict &&
      rootDomain &&
      appUrl.hostname !== rootDomain &&
      !appUrl.hostname.endsWith(`.${rootDomain}`)
    ) {
      issues.push("APP_URL: hostname must belong to NEXT_PUBLIC_ROOT_DOMAIN");
    }
  }

  const resolver = parseUrl(
    source,
    "DOMAIN_RESOLVER_ORIGIN",
    ["https:", "http:"],
    issues,
    false,
  );
  if (resolver) {
    const privateRailway = resolver.hostname.endsWith(".railway.internal");
    if (strict && resolver.protocol !== "https:" && !privateRailway) {
      issues.push("DOMAIN_RESOLVER_ORIGIN: must use https unless it is a Railway private origin");
    }
    if (
      resolver.pathname !== "/" ||
      resolver.search ||
      resolver.hash ||
      resolver.username ||
      resolver.password
    ) {
      issues.push("DOMAIN_RESOLVER_ORIGIN: must be an origin without credentials or path");
    }
  }

  const feeRaw = get(source, "AERA_PLATFORM_FEE_PERCENT") || "5";
  const fee = Number(feeRaw);
  if (!Number.isFinite(fee) || fee < 0 || fee > 50) {
    issues.push("AERA_PLATFORM_FEE_PERCENT: must be a number between 0 and 50");
  }

  // Stripe: the secret key alone enables payments (hosted checkout). The
  // webhook secret, publishable key and creator-plan price IDs extend it and
  // are validated when configured; test-mode keys are legitimate everywhere
  // (a staging deployment is still a "production" profile).
  const stripeSecret = get(source, "STRIPE_SECRET_KEY");
  if (stripeSecret && !/^(?:sk|rk)_(?:live|test)_/.test(stripeSecret)) {
    issues.push("STRIPE_SECRET_KEY: must be a Stripe secret or restricted key");
  }
  if (get(source, "STRIPE_WEBHOOK_SECRET")) {
    requireSecret(source, "STRIPE_WEBHOOK_SECRET", 12, issues, false, "whsec_");
  }
  if (get(source, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")) {
    requireSecret(source, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", 16, issues, false, "pk_");
  }
  const stripePriceKeys = [
    "STRIPE_CREATOR_STARTER_PRICE_ID",
    "STRIPE_CREATOR_PRO_PRICE_ID",
    "STRIPE_CREATOR_SCALE_PRICE_ID",
  ] as const;
  if (validateCompleteGroup(source, stripePriceKeys, issues, false)) {
    for (const key of stripePriceKeys) {
      if (!/^price_[A-Za-z0-9]+$/.test(get(source, key))) {
        issues.push(`${key}: must be a Stripe Price ID`);
      }
    }
  }

  const emailKeys = ["RESEND_API_KEY", "EMAIL_FROM"] as const;
  if (validateCompleteGroup(source, emailKeys, issues, false)) {
    requireSecret(source, "RESEND_API_KEY", 10, issues, true, "re_");
    const emailFrom = get(source, "EMAIL_FROM");
    const address = /<([^<>]+)>$/.exec(emailFrom)?.[1] ?? emailFrom;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      issues.push("EMAIL_FROM: must contain a valid sender address");
    }
    if (get(source, "RESEND_WEBHOOK_SECRET")) {
      requireSecret(source, "RESEND_WEBHOOK_SECRET", 20, issues, false, "whsec_");
    }
  }

  const storageKeys = [
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ] as const;
  if (validateCompleteGroup(source, storageKeys, issues, false)) {
    const storage = parseUrl(source, "S3_ENDPOINT", ["https:", "http:"], issues, true);
    if (
      strict &&
      storage?.protocol !== "https:" &&
      !storage?.hostname.endsWith(".railway.internal")
    ) {
      issues.push("S3_ENDPOINT: must use https unless it is a Railway private origin");
    }
    if (storage?.username || storage?.password || storage?.search || storage?.hash) {
      issues.push("S3_ENDPOINT: must not contain credentials, query or fragment");
    }
    requireSecret(source, "S3_ACCESS_KEY_ID", 8, issues, true);
    requireSecret(source, "S3_SECRET_ACCESS_KEY", 16, issues, true);
  }

  const redis = parseUrl(source, "REDIS_URL", ["redis:", "rediss:"], issues, false);
  if (redis && !redis.hostname) issues.push("REDIS_URL: must include a host");

  const clamHost = get(source, "CLAMAV_HOST");
  if (clamHost && (!/^[A-Za-z0-9._:-]+$/.test(clamHost) || clamHost.includes("/"))) {
    issues.push("CLAMAV_HOST: must be a hostname or IP address, not a URL");
  }
  const clamPort = Number(get(source, "CLAMAV_PORT") || "3310");
  if (!Number.isInteger(clamPort) || clamPort < 1 || clamPort > 65535) {
    issues.push("CLAMAV_PORT: must be an integer between 1 and 65535");
  }

  const vapidKeys = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"] as const;
  validateCompleteGroup(source, vapidKeys, issues, false);

  if (issues.length > 0) throw new EnvironmentValidationError([...new Set(issues)]);
}
