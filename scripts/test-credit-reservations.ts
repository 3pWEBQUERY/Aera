/**
 * Railway smoke test for the database-atomic AI credit functions.
 * Every write happens inside a transaction that is always rolled back.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  try {
    const walletResult = await client.query<{
      tenantId: string;
      includedRemaining: number;
      purchasedRemaining: number;
    }>(
      `SELECT "tenantId", "includedRemaining", "purchasedRemaining"
       FROM "AiCreditWallet" ORDER BY "createdAt" ASC LIMIT 1`,
    );
    const wallet = walletResult.rows[0];
    if (!wallet) {
      console.log("ℹ️ Keine AI-Wallet vorhanden; Funktionsmigration ist installiert, Laufzeittest übersprungen.");
      return;
    }

    // Ensure enough temporary balance for both paths; ROLLBACK restores it.
    await client.query(
      `UPDATE "AiCreditWallet"
       SET "includedRemaining" = GREATEST("includedRemaining", 3)
       WHERE "tenantId" = $1`,
      [wallet.tenantId],
    );

    const before = await client.query<{ balance: number }>(
      `SELECT "includedRemaining" + "purchasedRemaining" AS balance
       FROM "AiCreditWallet" WHERE "tenantId" = $1`,
      [wallet.tenantId],
    );
    const initialBalance = Number(before.rows[0]?.balance ?? 0);

    const releaseId = randomUUID();
    const reserved = await client.query<{ ok: boolean }>(
      `SELECT aera_reserve_ai_credit($1, $2, NULL, NULL, 'smoke_test') AS ok`,
      [releaseId, wallet.tenantId],
    );
    if (!reserved.rows[0]?.ok) throw new Error("Reservation failed");
    const released = await client.query<{ ok: boolean }>(
      `SELECT aera_release_ai_credit($1, $2) AS ok`,
      [releaseId, wallet.tenantId],
    );
    if (!released.rows[0]?.ok) throw new Error("Release failed");

    const settleId = randomUUID();
    const usageId = randomUUID();
    const reservedForSettlement = await client.query<{ ok: boolean }>(
      `SELECT aera_reserve_ai_credit($1, $2, NULL, NULL, 'smoke_test') AS ok`,
      [settleId, wallet.tenantId],
    );
    if (!reservedForSettlement.rows[0]?.ok) throw new Error("Settlement reservation failed");
    const settled = await client.query<{ charged: number }>(
      `SELECT aera_settle_ai_credit($1, $2, $3, 1000, 1000, 2000, 2) AS charged`,
      [settleId, wallet.tenantId, usageId],
    );
    if (Number(settled.rows[0]?.charged) !== 2) throw new Error("Settlement amount mismatch");

    const after = await client.query<{ balance: number }>(
      `SELECT "includedRemaining" + "purchasedRemaining" AS balance
       FROM "AiCreditWallet" WHERE "tenantId" = $1`,
      [wallet.tenantId],
    );
    if (Number(after.rows[0]?.balance) !== initialBalance - 2) {
      throw new Error("Wallet balance mismatch");
    }
    const usage = await client.query(`SELECT 1 FROM "AiUsageEvent" WHERE "id" = $1`, [usageId]);
    if (usage.rowCount !== 1) throw new Error("Usage ledger entry missing");

    // Verify refund clawback without leaving a purchase or balance mutation.
    const purchaseId = randomUUID();
    const paymentIntentId = `pi_smoke_${randomUUID()}`;
    await client.query(
      `UPDATE "AiCreditWallet"
       SET "purchasedRemaining" = "purchasedRemaining" + 2
       WHERE "tenantId" = $1`,
      [wallet.tenantId],
    );
    await client.query(
      `INSERT INTO "AiCreditPurchase" (
         "id", "tenantId", "packId", "credits", "priceCents", "status",
         "stripePaymentIntentId", "createdAt"
       ) VALUES ($1, $2, 'smoke_pack', 2, 100, 'COMPLETED', $3, CURRENT_TIMESTAMP)`,
      [purchaseId, wallet.tenantId, paymentIntentId],
    );
    const refunded = await client.query<{ removed: number }>(
      `SELECT aera_refund_ai_credit_purchase($1, $2) AS removed`,
      [wallet.tenantId, paymentIntentId],
    );
    if (Number(refunded.rows[0]?.removed) !== 2) throw new Error("Refund clawback mismatch");
    const purchase = await client.query<{ status: string; refundedAt: Date | null }>(
      `SELECT "status", "refundedAt" FROM "AiCreditPurchase" WHERE "id" = $1`,
      [purchaseId],
    );
    if (purchase.rows[0]?.status !== "REFUNDED" || !purchase.rows[0]?.refundedAt) {
      throw new Error("Refund state missing");
    }

    console.log("✅ Reservieren, Freigeben, Abrechnen und Erstatten funktionieren atomar.");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

main().catch((error) => {
  console.error("❌ AI-Credit-Datenbanktest fehlgeschlagen:", error);
  process.exit(1);
});
