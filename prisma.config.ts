import { defineConfig } from "prisma/config";

// Load .env without requiring the `dotenv` package, so the Prisma CLI / MCP
// can run migrations even before `npm install` has populated node_modules.
// process.loadEnvFile is built into Node 20.12+ / 21+.
try {
  if (typeof process.loadEnvFile === "function") process.loadEnvFile();
} catch {
  /* .env not present yet — env vars may be provided by the shell */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` (runs in postinstall on every service, incl. the cron
  // worker) does not connect, so DATABASE_URL may be absent there. Fall back to
  // an empty string instead of throwing. `migrate deploy` still requires a real
  // value, which is present wherever migrations actually run.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
