import "dotenv/config";
import {
  EnvironmentValidationError,
  validateEnvironment,
  type EnvironmentProfile,
} from "../lib/env-validation";

const profileArg = process.argv.find((arg) => arg.startsWith("--profile="));
const profile = (profileArg?.slice("--profile=".length) || "production") as EnvironmentProfile;

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
  process.exit(1);
}

