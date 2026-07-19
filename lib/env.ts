// Centralized environment access with helpful guards.
import { validateEnvironment } from "./env-validation";

// Next evaluates server modules while producing the build. Runtime validation
// is handled by `prestart`; explicit AERA_ENVIRONMENT=production also protects
// alternative process managers that invoke the Next server directly.
if (
  process.env.AERA_ENVIRONMENT === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  validateEnvironment(process.env, "production");
}

/**
 * AUTH_SECRET signs all session JWTs. A predictable value lets anyone forge
 * sessions for arbitrary users, so production refuses to boot without a
 * strong secret. Generate one with: openssl rand -base64 48
 */
function requireAuthSecret(): string {
  const secret = process.env.AUTH_SECRET ?? "";
  if (process.env.NODE_ENV === "production") {
    if (secret.length < 32) {
      throw new Error(
        "AUTH_SECRET must be set to a random value of at least 32 characters in production. " +
          "Generate one with: openssl rand -base64 48",
      );
    }
    return secret;
  }
  // Development only: fall back so `next dev` works out of the box.
  return secret || "dev-insecure-secret-change-me-please-make-this-long-and-random-0001";
}

const STRIPE_PRICE_ID = /^price_[A-Za-z0-9]+$/;

/**
 * A configured creator-plan price must be a Stripe Price ID. In production an
 * invalid value is a deployment error; outside production it is ignored so
 * local development can use the explicit price_data fallback.
 */
function creatorPriceId(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value || STRIPE_PRICE_ID.test(value)) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be a Stripe Price ID starting with price_`);
  }
  return "";
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  AUTH_SECRET: requireAuthSecret(),
  /**
   * Versioned AES-256-GCM keyring for database secrets. First key is primary.
   * Example: current:BASE64_32_BYTES,previous:BASE64_32_BYTES
   */
  DATA_ENCRYPTION_KEYS: process.env.AERA_DATA_ENCRYPTION_KEYS ?? "",
  /** Local QA login stays disabled unless this explicit 32+ char secret exists. */
  QA_LOGIN_SECRET: process.env.QA_LOGIN_SECRET ?? "",
  ROOT_DOMAIN: (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[/:].*$/, "")
    .toLowerCase(),
  /** Optional extra allowlist; DB role + verified e-mail + TOTP remain mandatory. */
  PLATFORM_ADMIN_EMAILS: (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  APP_URL: process.env.APP_URL ?? "http://localhost:3000",
  DOMAIN_RESOLVER_ORIGIN: process.env.DOMAIN_RESOLVER_ORIGIN ?? "http://localhost:3000",
  PLATFORM_FEE_PERCENT: Number.isFinite(Number(process.env.AERA_PLATFORM_FEE_PERCENT ?? "5"))
    ? Number(process.env.AERA_PLATFORM_FEE_PERCENT ?? "5")
    : 5,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
  STRIPE_CREATOR_PRICE_IDS: {
    STARTER: creatorPriceId("STRIPE_CREATOR_STARTER_PRICE_ID"),
    PRO: creatorPriceId("STRIPE_CREATOR_PRO_PRICE_ID"),
    SCALE: creatorPriceId("STRIPE_CREATOR_SCALE_PRICE_ID"),
  },
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET ?? "",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "Aera <noreply@aera.so>",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  // Google Gemini (primary AI provider). GEMINI_MODEL powers text generation,
  // GEMINI_EMBED_MODEL the semantic-search embeddings.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  GEMINI_MODEL: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
  GEMINI_EMBED_MODEL: process.env.GEMINI_EMBED_MODEL ?? "text-embedding-004",
  // Image generation & editing (multimodal output). Powers the assistant's
  // "Bild"-Modus. Falls back to Google's image model when unset.
  GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image",
  /** Redis für instanzübergreifende Rate-Limits (optional, z. B. Railway Redis). */
  REDIS_URL: process.env.REDIS_URL ?? "",
  /** Web-Push (VAPID). Erzeugen mit: npx web-push generate-vapid-keys */
  VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? "",
  /** Secret für den Automations-Cron (/api/cron/automations). */
  CRON_SECRET: process.env.CRON_SECRET ?? "",
  // Railway S3-compatible bucket
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "",
  S3_REGION: process.env.S3_REGION ?? "auto",
  S3_BUCKET: process.env.S3_BUCKET ?? "",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? "",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? "",
  S3_PUBLIC_URL: process.env.S3_PUBLIC_URL ?? "",
  /** Optional ClamAV daemon used to scan direct uploads before publication. */
  CLAMAV_HOST: process.env.CLAMAV_HOST ?? "",
  CLAMAV_PORT: Number.isInteger(Number(process.env.CLAMAV_PORT ?? "3310"))
    ? Number(process.env.CLAMAV_PORT ?? "3310")
    : 3310,
  /** Bundle-ID der iOS-App (z. B. "so.aera.app") — Pflicht für Apple-IAP-Validierung. */
  APPLE_BUNDLE_ID: process.env.APPLE_BUNDLE_ID ?? "",
  /** "1" erlaubt Sandbox-Transaktionen (TestFlight/Simulator); Production sonst Pflicht. */
  APPLE_IAP_ALLOW_SANDBOX: process.env.APPLE_IAP_ALLOW_SANDBOX === "1",
};

export const features = {
  stripe: Boolean(env.STRIPE_SECRET_KEY),
  // A payment is only safe when Stripe can call back into the durable
  // fulfilment webhook. Connect onboarding may still use `stripe` alone.
  marketplacePayments: Boolean(
    env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET,
  ),
  // Live creator subscriptions must use the three fixed, server-owned Prices.
  // Local/test environments retain price_data so onboarding can be exercised
  // without first creating Stripe catalog objects.
  creatorBilling: Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_WEBHOOK_SECRET &&
      (process.env.NODE_ENV !== "production" ||
        Object.values(env.STRIPE_CREATOR_PRICE_IDS).every(Boolean)),
  ),
  email: Boolean(env.RESEND_API_KEY),
  aiEmbeddings: Boolean(env.GEMINI_API_KEY || env.OPENAI_API_KEY),
  gemini: Boolean(env.GEMINI_API_KEY),
  storage: Boolean(
    env.S3_ENDPOINT &&
      env.S3_BUCKET &&
      env.S3_ACCESS_KEY_ID &&
      env.S3_SECRET_ACCESS_KEY,
  ),
  push: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
};
