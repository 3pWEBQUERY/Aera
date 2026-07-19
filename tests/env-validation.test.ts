import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EnvironmentValidationError,
  validateEnvironment,
  type EnvironmentSource,
} from "@/lib/env-validation";

/** Core-only production configuration: what a fresh Railway deploy needs. */
const minimalProduction = {
  DATABASE_URL: "postgresql://aera:strong-db-password@db.railway.internal:5432/aera",
  AUTH_SECRET: "auth-secret-with-more-than-thirty-two-random-characters",
  NEXT_PUBLIC_ROOT_DOMAIN: "aera.so",
  APP_URL: "https://aera.so",
} satisfies EnvironmentSource;

/** Fully integrated production configuration: every optional group complete. */
const validProduction = {
  ...minimalProduction,
  AERA_DATA_ENCRYPTION_KEYS: "current:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  CRON_SECRET: "cron-secret-with-more-than-thirty-two-random-characters",
  DOMAIN_RESOLVER_ORIGIN: "http://aera.railway.internal",
  AERA_PLATFORM_FEE_PERCENT: "5",
  STRIPE_SECRET_KEY: "sk_live_ci_12345678901234567890",
  STRIPE_WEBHOOK_SECRET: "whsec_12345678901234567890",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_ci_12345678901234567890",
  STRIPE_CREATOR_STARTER_PRICE_ID: "price_Starter123",
  STRIPE_CREATOR_PRO_PRICE_ID: "price_Pro123",
  STRIPE_CREATOR_SCALE_PRICE_ID: "price_Scale123",
  RESEND_API_KEY: "re_ci_12345678901234567890",
  RESEND_WEBHOOK_SECRET: "whsec_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  EMAIL_FROM: "Aera <noreply@aera.so>",
  S3_ENDPOINT: "https://storage.railway.app",
  S3_BUCKET: "aera-private",
  S3_ACCESS_KEY_ID: "ci-access-key",
  S3_SECRET_ACCESS_KEY: "ci-secret-access-key-value",
  REDIS_URL: "redis://default:secret@redis.railway.internal:6379",
  CLAMAV_HOST: "clamav.railway.internal",
  CLAMAV_PORT: "3310",
} satisfies EnvironmentSource;

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

describe("production environment validation", () => {
  it("ships the tools used by Railway pre-deploy and prestart in the runtime image", () => {
    expect(packageJson.scripts?.["db:predeploy"]).toContain("prisma migrate deploy");
    expect(packageJson.scripts?.prestart).toContain("env:check");
    for (const runtimeTool of ["prisma", "tsx"]) {
      expect(packageJson.dependencies?.[runtimeTool]).toBeTruthy();
      expect(packageJson.devDependencies?.[runtimeTool]).toBeUndefined();
    }
  });

  it("accepts a complete production configuration", () => {
    expect(() => validateEnvironment(validProduction, "production")).not.toThrow();
    expect(() =>
      validateEnvironment(
        { ...validProduction, STRIPE_SECRET_KEY: "rk_live_ci_12345678901234567890" },
        "production",
      ),
    ).not.toThrow();
  });

  it("accepts a minimal production configuration — integrations are progressive", () => {
    expect(() => validateEnvironment(minimalProduction, "production")).not.toThrow();
    // Payments in test mode are a legitimate production-profile setup
    // (e.g. a staging deployment), and the secret key alone enables them.
    expect(() =>
      validateEnvironment(
        { ...minimalProduction, STRIPE_SECRET_KEY: "sk_test_ci_12345678901234567890" },
        "production",
      ),
    ).not.toThrow();
  });

  it("hard-requires only the launch-critical core", () => {
    try {
      validateEnvironment({}, "production");
      throw new Error("expected validation error");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      const issues = (error as EnvironmentValidationError).issues.join("\n");
      expect(issues).toContain("DATABASE_URL");
      expect(issues).toContain("AUTH_SECRET");
      expect(issues).toContain("NEXT_PUBLIC_ROOT_DOMAIN");
      expect(issues).toContain("APP_URL");
      // Optional integrations must not block a deployment when absent.
      expect(issues).not.toContain("REDIS_URL");
      expect(issues).not.toContain("CLAMAV_HOST");
      expect(issues).not.toContain("STRIPE_WEBHOOK_SECRET");
      expect(issues).not.toContain("AERA_DATA_ENCRYPTION_KEYS");
      expect(issues).not.toContain("CRON_SECRET");
      expect(issues).not.toContain("DOMAIN_RESOLVER_ORIGIN");
    }
  });

  it("rejects localhost and insecure public production origins", () => {
    expect(() =>
      validateEnvironment(
        {
          ...validProduction,
          APP_URL: "http://localhost:3000",
          DOMAIN_RESOLVER_ORIGIN: "http://public.example.net",
        },
        "production",
      ),
    ).toThrow(/APP_URL: must use https/);
  });

  it("rejects malformed keyrings, numbers and partial optional groups", () => {
    expect(() =>
      validateEnvironment(
        {
          ...validProduction,
          AERA_DATA_ENCRYPTION_KEYS: "current:not-base64",
          AERA_PLATFORM_FEE_PERCENT: "NaN",
          CLAMAV_PORT: "70000",
          NEXT_PUBLIC_VAPID_PUBLIC_KEY: "only-one-half",
        },
        "production",
      ),
    ).toThrow(/AERA_DATA_ENCRYPTION_KEYS/);
  });

  it("uses the same padded canonical base64 format as runtime encryption", () => {
    const unpadded = validProduction.AERA_DATA_ENCRYPTION_KEYS.replace(/=+$/, "");
    expect(() =>
      validateEnvironment(
        { ...validProduction, AERA_DATA_ENCRYPTION_KEYS: unpadded },
        "production",
      ),
    ).toThrow(/canonical base64 for 32 bytes/);
  });

  it("never includes secret values in validation errors", () => {
    const leaked = "super-sensitive-value-that-must-never-be-logged";
    try {
      validateEnvironment({ ...validProduction, AUTH_SECRET: leaked, REDIS_URL: leaked }, "production");
      throw new Error("expected validation error");
    } catch (error) {
      expect(String(error)).not.toContain(leaked);
      expect(String(error)).toContain("REDIS_URL");
    }
  });

  it("keeps integrations optional but rejects partial groups", () => {
    expect(() => validateEnvironment({}, "development")).not.toThrow();
    expect(() =>
      validateEnvironment(
        {
          NEXT_PUBLIC_ROOT_DOMAIN: "localhost",
          APP_URL: "http://localhost:3000",
          DOMAIN_RESOLVER_ORIGIN: "http://localhost:3000",
        },
        "development",
      ),
    ).not.toThrow();
    // The secret key alone is a valid Stripe setup (hosted checkout)…
    expect(() =>
      validateEnvironment({ STRIPE_SECRET_KEY: "sk_test_1234567890123456" }, "development"),
    ).not.toThrow();
    // …but grouped values must be complete so features cannot half-enable.
    expect(() =>
      validateEnvironment(
        { STRIPE_CREATOR_STARTER_PRICE_ID: "price_Starter123" },
        "development",
      ),
    ).toThrow(/STRIPE_CREATOR_PRO_PRICE_ID/);
    expect(() =>
      validateEnvironment({ S3_BUCKET: "aera-private" }, "production"),
    ).toThrow(/S3_ENDPOINT/);
  });
});
