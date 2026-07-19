/** Railway smoke test for exclusive newsletter delivery claims. */
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
    const row = tenant.rows[0];
    if (!row) {
      console.log("ℹ️ Kein Tenant vorhanden; Newsletter-Outbox installiert, Laufzeittest übersprungen.");
      return;
    }

    const campaignId = randomUUID();
    const deliveryId = randomUUID();
    await client.query(
      `INSERT INTO "NewsletterCampaign" (
         "id", "tenantId", "subject", "body", "status", "createdById", "createdAt"
       ) VALUES ($1, $2, 'Smoke', 'Smoke body', 'SENDING', $3, CURRENT_TIMESTAMP)`,
      [campaignId, row.id, row.ownerId],
    );
    await client.query(
      `INSERT INTO "NewsletterDelivery" (
         "id", "tenantId", "campaignId", "userId", "recipientEmail", "subject", "html",
         "status", "nextAttemptAt", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, 'smoke@example.invalid', 'Smoke', '<p>Smoke</p>',
         'PENDING', CURRENT_TIMESTAMP - INTERVAL '1 second', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [deliveryId, row.id, campaignId, row.ownerId],
    );

    const claimed = await client.query<{ delivery_id: string; tenant_id: string }>(
      `SELECT * FROM aera_claim_newsletter_deliveries(200)`,
    );
    if (!claimed.rows.some((claim) => claim.delivery_id === deliveryId && claim.tenant_id === row.id)) {
      const candidate = await client.query<{ status: string; nextAttemptAt: Date; leaseUntil: Date | null }>(
        `SELECT "status", "nextAttemptAt", "leaseUntil" FROM "NewsletterDelivery" WHERE "id" = $1`,
        [deliveryId],
      );
      throw new Error(
        `Pending newsletter delivery was not claimed: claims=${JSON.stringify(claimed.rows)}, candidate=${JSON.stringify(candidate.rows)}`,
      );
    }
    const state = await client.query<{ status: string; leaseUntil: Date | null }>(
      `SELECT "status", "leaseUntil" FROM "NewsletterDelivery" WHERE "id" = $1`,
      [deliveryId],
    );
    if (state.rows[0]?.status !== "PROCESSING" || !state.rows[0]?.leaseUntil) {
      throw new Error("Newsletter lease was not persisted");
    }
    console.log("✅ Newsletter-Outbox claimt Zustellungen exklusiv und speichert die Lease.");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

main().catch((error) => {
  console.error("❌ Newsletter-Outbox-Datenbanktest fehlgeschlagen:", error);
  process.exit(1);
});
