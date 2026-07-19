/**
 * Minimal, deterministic fixtures for database smoke tests in CI.
 *
 * This script is deliberately impossible to run against a production-looking
 * database: both the CI marker and a local host + CI/test database name are
 * required before it opens a connection.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

function assertCiDatabase(rawUrl: string | undefined): string {
  if (process.env.CI !== "true") {
    throw new Error("CI fixture seeding requires CI=true");
  }
  if (!rawUrl) throw new Error("DATABASE_URL is not set");

  const url = new URL(rawUrl);
  const database = url.pathname.slice(1).toLowerCase();
  const localHosts = new Set(["127.0.0.1", "localhost", "postgres"]);
  if (!localHosts.has(url.hostname) || !/(?:^|[_-])(ci|test)(?:$|[_-])/.test(database)) {
    throw new Error("Refusing to seed fixtures outside a local CI/test database");
  }
  return rawUrl;
}

async function main() {
  const client = new Client({ connectionString: assertCiDatabase(process.env.DATABASE_URL) });
  await client.connect();
  await client.query("BEGIN");

  try {
    const userId = randomUUID();
    const tenantId = randomUUID();

    const user = await client.query<{ id: string }>(
      `INSERT INTO "User" (
         "id", "email", "passwordHash", "name", "emailVerifiedAt", "createdAt", "updatedAt"
       ) VALUES ($1, 'ci-owner@aera.test', 'ci-only-not-a-login-hash', 'CI Owner',
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("email") DO UPDATE SET "updatedAt" = CURRENT_TIMESTAMP
       RETURNING "id"`,
      [userId],
    );
    const persistedUserId = user.rows[0]!.id;

    const tenant = await client.query<{ id: string }>(
      `INSERT INTO "Tenant" (
         "id", "name", "slug", "subdomain", "ownerId", "createdAt", "updatedAt"
       ) VALUES ($1, 'Aera CI Community', 'aera-ci-community', 'aera-ci-community', $2,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("slug") DO UPDATE SET
         "ownerId" = EXCLUDED."ownerId", "updatedAt" = CURRENT_TIMESTAMP
       RETURNING "id"`,
      [tenantId, persistedUserId],
    );
    const persistedTenantId = tenant.rows[0]!.id;

    await client.query(
      `INSERT INTO "Membership" (
         "id", "tenantId", "userId", "role", "status", "joinedAt"
       ) VALUES ($1, $2, $3, 'OWNER', 'ACTIVE', CURRENT_TIMESTAMP)
       ON CONFLICT ("tenantId", "userId") DO UPDATE SET
         "role" = 'OWNER', "status" = 'ACTIVE'`,
      [randomUUID(), persistedTenantId, persistedUserId],
    );

    await client.query(
      `INSERT INTO "MembershipTier" (
         "id", "tenantId", "name", "slug", "description", "isRecommended",
         "priceCents", "currency", "interval", "entitlementKey", "isDefault",
         "isPublic", "sortOrder", "createdAt"
       ) VALUES ($1, $2, 'CI Premium', 'ci-premium',
         'Deterministic paid tier for checkout and consent E2E coverage.', TRUE,
         1900, 'eur', 'MONTH', 'tier:ci-premium', FALSE, TRUE, 10,
         CURRENT_TIMESTAMP)
       ON CONFLICT ("tenantId", "slug") DO UPDATE SET
         "priceCents" = EXCLUDED."priceCents", "interval" = EXCLUDED."interval",
         "isPublic" = TRUE, "isRecommended" = TRUE`,
      [randomUUID(), persistedTenantId],
    );

    await client.query(
      `INSERT INTO "AiCreditWallet" (
         "id", "tenantId", "plan", "monthlyCredits", "includedRemaining",
         "purchasedRemaining", "periodStart", "periodEnd", "createdAt", "updatedAt"
       ) VALUES ($1, $2, 'FREE', 500, 500, 0, CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP + INTERVAL '1 month', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("tenantId") DO UPDATE SET
         "includedRemaining" = GREATEST("AiCreditWallet"."includedRemaining", 500),
         "updatedAt" = CURRENT_TIMESTAMP`,
      [randomUUID(), persistedTenantId],
    );

    await client.query("COMMIT");
    console.log("CI database fixtures are ready.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("CI fixture seeding failed:", error);
  process.exit(1);
});
