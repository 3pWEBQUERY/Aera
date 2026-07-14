CREATE TYPE "NewsletterDeliveryStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'RETRYING', 'SENT', 'EXHAUSTED'
);

ALTER TABLE "EmailEvent" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "EmailEvent_dedupeKey_key" ON "EmailEvent"("dedupeKey");

CREATE TABLE "NewsletterDelivery" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "status" "NewsletterDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "leaseUntil" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NewsletterDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsletterDelivery_campaignId_userId_key"
  ON "NewsletterDelivery"("campaignId", "userId");
CREATE INDEX "NewsletterDelivery_tenantId_campaignId_idx"
  ON "NewsletterDelivery"("tenantId", "campaignId");
CREATE INDEX "NewsletterDelivery_status_nextAttemptAt_idx"
  ON "NewsletterDelivery"("status", "nextAttemptAt");

ALTER TABLE "NewsletterDelivery"
  ADD CONSTRAINT "NewsletterDelivery_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsletterDelivery"
  ADD CONSTRAINT "NewsletterDelivery_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "NewsletterCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION aera_claim_newsletter_deliveries(p_limit INTEGER)
RETURNS TABLE(delivery_id TEXT, tenant_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE "NewsletterDelivery"
  SET "status" = 'RETRYING', "leaseUntil" = NULL,
      "nextAttemptAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "status" = 'PROCESSING'
    AND "leaseUntil" IS NOT NULL
    AND "leaseUntil" <= CURRENT_TIMESTAMP;

  RETURN QUERY
  WITH candidates AS (
    SELECT d."id"
    FROM "NewsletterDelivery" d
    WHERE d."status" IN ('PENDING', 'RETRYING')
      AND d."nextAttemptAt" <= CURRENT_TIMESTAMP
    ORDER BY d."nextAttemptAt" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
  )
  UPDATE "NewsletterDelivery" d
  SET "status" = 'PROCESSING',
      "leaseUntil" = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
      "updatedAt" = CURRENT_TIMESTAMP
  FROM candidates c
  WHERE d."id" = c."id"
  RETURNING d."id", d."tenantId";
END;
$$;
