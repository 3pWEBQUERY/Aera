ALTER TABLE "Order"
  ADD COLUMN "grantedEntitlementKey" TEXT,
  ADD COLUMN "refundedAt" TIMESTAMP(3);

-- Existing product orders can be backfilled safely from their linked product.
UPDATE "Order" AS o
SET "grantedEntitlementKey" = p."grantsEntitlementKey"
FROM "Product" AS p
WHERE o."productId" = p."id" AND p."grantsEntitlementKey" IS NOT NULL;

CREATE INDEX "Order_tenantId_stripePaymentIntentId_idx"
  ON "Order"("tenantId", "stripePaymentIntentId");

ALTER TABLE "AiCreditPurchase" ADD COLUMN "refundedAt" TIMESTAMP(3);
CREATE INDEX "AiCreditPurchase_tenantId_stripePaymentIntentId_idx"
  ON "AiCreditPurchase"("tenantId", "stripePaymentIntentId");

ALTER TABLE "ReferralConversion" ADD COLUMN "reversedAt" TIMESTAMP(3);

-- Atomically mark an AI-credit purchase refunded and claw back only credits
-- that have not yet been consumed. The purchase history itself is preserved.
CREATE OR REPLACE FUNCTION aera_refund_ai_credit_purchase(
  p_tenant_id TEXT,
  p_payment_intent_id TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  purchase RECORD;
  v_removed INTEGER;
BEGIN
  PERFORM set_config('aera.tenant_id', p_tenant_id, TRUE);
  SELECT * INTO purchase
  FROM "AiCreditPurchase"
  WHERE "tenantId" = p_tenant_id
    AND "stripePaymentIntentId" = p_payment_intent_id
  ORDER BY "createdAt" DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR purchase."refundedAt" IS NOT NULL THEN RETURN 0; END IF;

  SELECT LEAST("purchasedRemaining", purchase."credits") INTO v_removed
  FROM "AiCreditWallet"
  WHERE "tenantId" = p_tenant_id
  FOR UPDATE;

  UPDATE "AiCreditWallet"
  SET "purchasedRemaining" = GREATEST(0, "purchasedRemaining" - COALESCE(v_removed, 0)),
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "tenantId" = p_tenant_id;

  UPDATE "AiCreditPurchase"
  SET "status" = 'REFUNDED', "refundedAt" = CURRENT_TIMESTAMP
  WHERE "id" = purchase."id";

  RETURN COALESCE(v_removed, 0);
END;
$$;
