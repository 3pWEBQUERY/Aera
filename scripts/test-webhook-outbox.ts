/** Railway smoke test for the durable webhook claim/lease function. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  try {
    const tenant = await client.query<{ id: string }>(
      `SELECT "id" FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1`,
    );
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) {
      console.log("ℹ️ Kein Tenant vorhanden; Outbox-Funktion installiert, Laufzeittest übersprungen.");
      return;
    }

    const endpointId = randomUUID();
    const deliveryId = randomUUID();
    const eventId = `evt_smoke_${randomUUID()}`;
    await client.query(
      `INSERT INTO "WebhookEndpoint" (
         "id", "tenantId", "url", "secret", "events", "isActive", "createdAt"
       ) VALUES ($1, $2, 'https://example.invalid/webhook', 'whsec_smoke',
         ARRAY['order.paid']::TEXT[], TRUE, CURRENT_TIMESTAMP)`,
      [endpointId, tenantId],
    );
    await client.query(
      `INSERT INTO "WebhookDelivery" (
         "id", "tenantId", "endpointId", "eventId", "event", "payload",
         "status", "nextAttemptAt", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, 'order.paid', $5::jsonb,
         'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [deliveryId, tenantId, endpointId, eventId, JSON.stringify({ id: eventId, type: "order.paid", data: {} })],
    );

    const claimed = await client.query<{ delivery_id: string; tenant_id: string }>(
      `SELECT * FROM aera_claim_webhook_deliveries(10)`,
    );
    if (!claimed.rows.some((row) => row.delivery_id === deliveryId && row.tenant_id === tenantId)) {
      throw new Error("Pending delivery was not claimed");
    }
    const state = await client.query<{ status: string; leaseUntil: Date | null }>(
      `SELECT "status", "leaseUntil" FROM "WebhookDelivery" WHERE "id" = $1`,
      [deliveryId],
    );
    if (state.rows[0]?.status !== "PROCESSING" || !state.rows[0]?.leaseUntil) {
      throw new Error("Delivery lease was not persisted");
    }
    console.log("✅ Webhook-Outbox claimt fällige Zustellungen mit exklusiver Datenbank-Lease.");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

main().catch((error) => {
  console.error("❌ Webhook-Outbox-Datenbanktest fehlgeschlagen:", error);
  process.exit(1);
});
