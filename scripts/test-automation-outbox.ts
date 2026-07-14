/** Railway smoke test for RLS-safe automation discovery and delivery claims. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  try {
    const tenant = await client.query<{ id: string; ownerId: string }>(
      `SELECT "id", "ownerId" FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1`,
    );
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) {
      console.log("ℹ️ Kein Tenant vorhanden; Automation-Outbox installiert, Laufzeittest übersprungen.");
      return;
    }

    const stepId = randomUUID();
    const deliveryId = randomUUID();
    await client.query(
      `INSERT INTO "AutomationStep" (
         "id", "tenantId", "dayOffset", "subject", "body", "isActive", "createdAt"
       ) VALUES ($1, $2, 0, 'Smoke', 'Smoke body', TRUE, CURRENT_TIMESTAMP)`,
      [stepId, tenantId],
    );
    await client.query(
      `INSERT INTO "AutomationDelivery" (
         "id", "tenantId", "stepId", "userId", "recipientEmail", "subject", "html",
         "status", "nextAttemptAt", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, 'smoke@example.invalid', 'Smoke', '<p>Smoke</p>',
         'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [deliveryId, tenantId, stepId, tenant.rows[0]!.ownerId],
    );

    const steps = await client.query<{ step_id: string; tenant_id: string }>(
      `SELECT * FROM aera_active_automation_steps()`,
    );
    if (!steps.rows.some((row) => row.step_id === stepId && row.tenant_id === tenantId)) {
      throw new Error("Active automation step was not discoverable");
    }
    const claimed = await client.query<{ delivery_id: string; tenant_id: string }>(
      `SELECT * FROM aera_claim_automation_deliveries(200)`,
    );
    if (!claimed.rows.some((row) => row.delivery_id === deliveryId && row.tenant_id === tenantId)) {
      throw new Error("Pending automation delivery was not claimed");
    }
    const state = await client.query<{ status: string; leaseUntil: Date | null }>(
      `SELECT "status", "leaseUntil" FROM "AutomationDelivery" WHERE "id" = $1`,
      [deliveryId],
    );
    if (state.rows[0]?.status !== "PROCESSING" || !state.rows[0]?.leaseUntil) {
      throw new Error("Automation lease was not persisted");
    }
    console.log("✅ Automation-Outbox findet Schritte tenant-sicher und claimt Zustellungen exklusiv.");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

main().catch((error) => {
  console.error("❌ Automation-Outbox-Datenbanktest fehlgeschlagen:", error);
  process.exit(1);
});
