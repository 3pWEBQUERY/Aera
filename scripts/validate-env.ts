import "dotenv/config";
import {
  EnvironmentValidationError,
  validateEnvironment,
  type EnvironmentProfile,
} from "../lib/env-validation";

const profileArg = process.argv.find((arg) => arg.startsWith("--profile="));
const profile = (profileArg?.slice("--profile=".length) || "production") as EnvironmentProfile;
// --report: print issues but exit 0. Used by `prestart` so a configuration
// nit can never block a deployment — problems surface in the deploy logs
// and at /api/health/ready instead of as an opaque crash loop.
const report = process.argv.includes("--report");

if (!(["development", "ci", "production"] as const).includes(profile)) {
  console.error("Environment profile must be development, ci or production.");
  process.exit(2);
}

try {
  validateEnvironment(process.env, profile);
  console.log(`✅ Aera ${profile} environment is complete and internally consistent.`);
} catch (error) {
  if (error instanceof EnvironmentValidationError) {
    console.error(error.message);
  } else {
    console.error("Environment validation failed without exposing configuration values.");
  }
  if (report) {
    console.error("⚠️  Continuing anyway (--report): fix the values above to enable the affected features.");
    process.exit(0);
  }
  process.exit(1);
}

