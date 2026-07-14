/** Railway smoke test: tenant queries really run under the RLS app role. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import prisma, { withTenantContext, withTenantTransaction } from "../lib/prisma";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  try {
    const tenants = await client.query<{ id: string }>(
      `SELECT "id" FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 2`,
    );
    const tenantId = tenants.rows[0]?.id;
    if (!tenantId) {
      console.log("ℹ️ Kein Tenant vorhanden; RLS-Rollentest übersprungen.");
      return;
    }

    await client.query("SET LOCAL ROLE aera_app");
    await client.query(`SELECT set_config('aera.tenant_id', $1, TRUE)`, [tenantId]);
    const visible = await client.query<{ id: string }>(`SELECT "id" FROM "Tenant"`);
    if (visible.rows.some((row) => row.id !== tenantId) || !visible.rows.some((row) => row.id === tenantId)) {
      throw new Error("Tenant RLS did not isolate the selected tenant");
    }

    const prismaVisible = await withTenantContext(tenantId, () =>
      prisma.tenant.findMany({ select: { id: true } }),
    );
    if (prismaVisible.some((row) => row.id !== tenantId) || !prismaVisible.some((row) => row.id === tenantId)) {
      const diagnostic = await withTenantContext(tenantId, () =>
        withTenantTransaction(async (tx) => ({
          role: await tx.$queryRaw<Array<{ current_user: string; tenant_id: string }>>`
            SELECT current_user, current_setting('aera.tenant_id', TRUE) AS tenant_id
          `,
          tenants: await tx.tenant.findMany({ select: { id: true } }),
        })),
      );
      throw new Error(
        `Prisma did not switch tenant operations to the RLS role: visible=${JSON.stringify(prismaVisible)}, diagnostic=${JSON.stringify(diagnostic)}`,
      );
    }

    const auditId = randomUUID();
    await client.query(
      `SELECT aera_write_audit($1, NULL, NULL, 'smoke.platform', NULL, NULL, '{}'::jsonb)`,
      [auditId],
    );
    console.log("✅ Tenant-Abfragen laufen unter aera_app isoliert; globale Audit-Logs funktionieren.");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("❌ RLS-Rollentest fehlgeschlagen:", error);
  process.exit(1);
});
