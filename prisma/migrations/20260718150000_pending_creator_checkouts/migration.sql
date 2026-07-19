-- A creator Checkout Session can exist before AiCreditWallet has a Stripe
-- subscription id. Persist that pre-payment state so tenant deletion and
-- duplicate submits cannot lose track of an externally billable contract.

CREATE TYPE "CreatorCheckoutStatus" AS ENUM (
  'CREATING',
  'OPEN',
  'COMPLETED',
  'EXPIRED',
  'FAILED'
);

CREATE TABLE "PendingCreatorCheckout" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "plan" "CreatorPlan" NOT NULL,
  "status" "CreatorCheckoutStatus" NOT NULL DEFAULT 'CREATING',
  "stripeSessionId" TEXT,
  "stripeSubscriptionId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PendingCreatorCheckout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingCreatorCheckout_stripeSessionId_key"
  ON "PendingCreatorCheckout"("stripeSessionId");

CREATE UNIQUE INDEX "PendingCreatorCheckout_stripeSubscriptionId_key"
  ON "PendingCreatorCheckout"("stripeSubscriptionId");

CREATE INDEX "PendingCreatorCheckout_tenantId_status_idx"
  ON "PendingCreatorCheckout"("tenantId", "status");

CREATE INDEX "PendingCreatorCheckout_status_expiresAt_idx"
  ON "PendingCreatorCheckout"("status", "expiresAt");

-- Exactly one creator-plan Checkout may be externally open per tenant. This
-- partial invariant complements Stripe's idempotency key under concurrent POSTs.
CREATE UNIQUE INDEX "PendingCreatorCheckout_active_tenant_key"
  ON "PendingCreatorCheckout"("tenantId")
  WHERE "status" IN ('CREATING', 'OPEN');

ALTER TABLE "PendingCreatorCheckout"
  ADD CONSTRAINT "PendingCreatorCheckout_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PendingCreatorCheckout"
  ADD CONSTRAINT "PendingCreatorCheckout_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- New tenant tables must be protected immediately; relying only on a later
-- apply-rls run would leave a deployment window without database isolation.
ALTER TABLE "PendingCreatorCheckout" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PendingCreatorCheckout"
  USING ("tenantId" = current_setting('aera.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('aera.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aera_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PendingCreatorCheckout" TO aera_app;
  END IF;
END $$;
