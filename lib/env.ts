// Centralized environment access with helpful guards.

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

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  AUTH_SECRET: requireAuthSecret(),
  ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost",
  /** Comma-separated e-mails with access to the platform admin (/admin). */
  PLATFORM_ADMIN_EMAILS: (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  APP_URL: process.env.APP_URL ?? "http://localhost:3000",
  PLATFORM_FEE_PERCENT: Number(process.env.AERA_PLATFORM_FEE_PERCENT ?? "5"),
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
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
  /** Bundle-ID der iOS-App (z. B. "so.aera.app") — Pflicht für Apple-IAP-Validierung. */
  APPLE_BUNDLE_ID: process.env.APPLE_BUNDLE_ID ?? "",
  /** "1" erlaubt Sandbox-Transaktionen (TestFlight/Simulator); Production sonst Pflicht. */
  APPLE_IAP_ALLOW_SANDBOX: process.env.APPLE_IAP_ALLOW_SANDBOX === "1",
};

export const features = {
  stripe: Boolean(env.STRIPE_SECRET_KEY),
  creatorBilling: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
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
