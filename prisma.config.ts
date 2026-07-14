import { defineConfig, env } from "prisma/config";

// Load .env without requiring the `dotenv` package, so the Prisma CLI / MCP
// can run migrations even before `npm install` has populated node_modules.
// process.loadEnvFile is built into Node 20.12+ / 21+.
try {
  // @ts-ignore - available on modern Node runtimes
  if (typeof process.loadEnvFile === "function") process.loadEnvFile();
} catch {
  /* .env not present yet — env vars may be provided by the shell */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
