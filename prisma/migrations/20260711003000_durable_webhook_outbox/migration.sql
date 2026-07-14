CREATE TYPE "WebhookDeliveryStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'RETRYING', 'DELIVERED', 'EXHAUSTED'
);

ALTER TABLE "WebhookDelivery"
  ADD COLUMN "eventId" TEXT,
  ADD COLUMN "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Preserve old delivery history without unexpectedly replaying old failures.
UPDATE "WebhookDelivery"
SET "eventId" = 'legacy_' || "id",
    "status" = CASE WHEN "ok" THEN 'DELIVERED'::"WebhookDeliveryStatus"
                    ELSE 'EXHAUSTED'::"WebhookDeliveryStatus" END,
    "attempts" = 1,
    "deliveredAt" = CASE WHEN "ok" THEN "createdAt" ELSE NULL END,
    "updatedAt" = "createdAt";

ALTER TABLE "WebhookDelivery" ALTER COLUMN "eventId" SET NOT NULL;
CREATE UNIQUE INDEX "WebhookDelivery_endpointId_eventId_key"
  ON "WebhookDelivery"("endpointId", "eventId");
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx"
  ON "WebhookDelivery"("status", "nextAttemptAt");

-- Global cron workers claim due rows through this narrowly-scoped function.
-- SKIP LOCKED plus a lease prevents duplicate delivery across app instances.
CREATE OR REPLACE FUNCTION aera_claim_webhook_deliveries(p_limit INTEGER)
RETURNS TABLE(delivery_id TEXT, tenant_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE "WebhookDelivery"
  SET "status" = 'RETRYING', "leaseUntil" = NULL,
      "nextAttemptAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "status" = 'PROCESSING'
    AND "leaseUntil" IS NOT NULL
    AND "leaseUntil" <= CURRENT_TIMESTAMP;

  RETURN QUERY
  WITH candidates AS (
    SELECT d."id"
    FROM "WebhookDelivery" d
    WHERE d."status" IN ('PENDING', 'RETRYING')
      AND d."nextAttemptAt" <= CURRENT_TIMESTAMP
    ORDER BY d."nextAttemptAt" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
  )
  UPDATE "WebhookDelivery" d
  SET "status" = 'PROCESSING',
      "leaseUntil" = CURRENT_TIMESTAMP + INTERVAL '2 minutes',
      "updatedAt" = CURRENT_TIMESTAMP
  FROM candidates c
  WHERE d."id" = c."id"
  RETURNING d."id", d."tenantId";
END;
$$;
