CREATE TYPE "StripeWebhookStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "objectId" TEXT,
  "tenantId" TEXT,
  "status" "StripeWebhookStatus" NOT NULL DEFAULT 'PROCESSING',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StripeWebhookEvent_tenantId_createdAt_idx"
  ON "StripeWebhookEvent"("tenantId", "createdAt");

CREATE INDEX "StripeWebhookEvent_status_updatedAt_idx"
  ON "StripeWebhookEvent"("status", "updatedAt");
