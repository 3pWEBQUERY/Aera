CREATE TYPE "AutomationDeliveryStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'RETRYING', 'SENT', 'EXHAUSTED'
);

ALTER TABLE "AutomationDelivery"
  ADD COLUMN "recipientEmail" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "subject" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "html" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "status" "AutomationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "error" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing rows represented successfully completed sends in the old model.
UPDATE "AutomationDelivery"
SET "status" = 'SENT', "attempts" = 1, "sentAt" = "createdAt", "updatedAt" = "createdAt";

CREATE INDEX "AutomationDelivery_status_nextAttemptAt_idx"
  ON "AutomationDelivery"("status", "nextAttemptAt");

CREATE OR REPLACE FUNCTION aera_active_automation_steps()
RETURNS TABLE(step_id TEXT, tenant_id TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "id", "tenantId"
  FROM "AutomationStep"
  WHERE "isActive" = TRUE
  ORDER BY "dayOffset" ASC, "createdAt" ASC;
$$;

CREATE OR REPLACE FUNCTION aera_claim_automation_deliveries(p_limit INTEGER)
RETURNS TABLE(delivery_id TEXT, tenant_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE "AutomationDelivery"
  SET "status" = 'RETRYING', "leaseUntil" = NULL,
      "nextAttemptAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "status" = 'PROCESSING'
    AND "leaseUntil" IS NOT NULL
    AND "leaseUntil" <= CURRENT_TIMESTAMP;

  RETURN QUERY
  WITH candidates AS (
    SELECT d."id"
    FROM "AutomationDelivery" d
    WHERE d."status" IN ('PENDING', 'RETRYING')
      AND d."nextAttemptAt" <= CURRENT_TIMESTAMP
    ORDER BY d."nextAttemptAt" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
  )
  UPDATE "AutomationDelivery" d
  SET "status" = 'PROCESSING',
      "leaseUntil" = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
      "updatedAt" = CURRENT_TIMESTAMP
  FROM candidates c
  WHERE d."id" = c."id"
  RETURNING d."id", d."tenantId";
END;
$$;
