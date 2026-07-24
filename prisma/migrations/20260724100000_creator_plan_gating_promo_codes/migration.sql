-- Creator package gating + platform promotion codes.
--
-- 1. The wallet now records WHERE a package came from. Stripe-owned plans are
--    untouchable by promo codes; promo grants refill locally like FREE and are
--    downgraded automatically once `promoExpiresAt` has passed.
-- 2. PromoCode/PromoCodeRedemption back the influencer invite codes issued in
--    /admin/codes. Redemption is per community and idempotent.

-- ---------------------------------------------------------------- wallet
CREATE TYPE "CreatorPlanSource" AS ENUM ('DEFAULT', 'STRIPE', 'PROMO');

ALTER TABLE "AiCreditWallet"
  ADD COLUMN "planSource" "CreatorPlanSource" NOT NULL DEFAULT 'DEFAULT',
  ADD COLUMN "promoCodeId" TEXT,
  ADD COLUMN "promoExpiresAt" TIMESTAMP(3);

-- Backfill: every paid wallet that exists today was created by Stripe.
UPDATE "AiCreditWallet"
   SET "planSource" = 'STRIPE'
 WHERE "plan" <> 'FREE'
    OR "stripeSubscriptionId" IS NOT NULL;

-- ------------------------------------------------------------ promo codes
CREATE TABLE "PromoCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "plan" "CreatorPlan" NOT NULL,
  "label" TEXT,
  "note" TEXT,
  "durationDays" INTEGER,
  "maxRedemptions" INTEGER NOT NULL DEFAULT 1,
  "redemptionCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
CREATE INDEX "PromoCode_isActive_expiresAt_idx" ON "PromoCode"("isActive", "expiresAt");
CREATE INDEX "PromoCode_plan_idx" ON "PromoCode"("plan");
CREATE INDEX "PromoCode_createdAt_idx" ON "PromoCode"("createdAt");

CREATE TABLE "PromoCodeRedemption" (
  "id" TEXT NOT NULL,
  "codeId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planBefore" "CreatorPlan" NOT NULL,
  "planAfter" "CreatorPlan" NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoCodeRedemption_pkey" PRIMARY KEY ("id")
);

-- A code unlocks a community exactly once, however often it is typed in.
CREATE UNIQUE INDEX "PromoCodeRedemption_codeId_tenantId_key"
  ON "PromoCodeRedemption"("codeId", "tenantId");
CREATE INDEX "PromoCodeRedemption_tenantId_idx" ON "PromoCodeRedemption"("tenantId");
CREATE INDEX "PromoCodeRedemption_codeId_redeemedAt_idx"
  ON "PromoCodeRedemption"("codeId", "redeemedAt");

ALTER TABLE "PromoCode"
  ADD CONSTRAINT "PromoCode_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PromoCodeRedemption"
  ADD CONSTRAINT "PromoCodeRedemption_codeId_fkey"
  FOREIGN KEY ("codeId") REFERENCES "PromoCode"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeRedemption"
  ADD CONSTRAINT "PromoCodeRedemption_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeRedemption"
  ADD CONSTRAINT "PromoCodeRedemption_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiCreditWallet"
  ADD CONSTRAINT "AiCreditWallet_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------- security
-- Promotion codes are a platform-level artefact: they are minted in /admin and
-- redeemed through the privileged client only, so `aera_app` receives no
-- grants at all. The tenant-scoped redemption ledger still carries the usual
-- isolation policy as defense in depth.
ALTER TABLE "PromoCodeRedemption" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PromoCodeRedemption"
  USING ("tenantId" = current_setting('aera.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('aera.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aera_app') THEN
    REVOKE ALL ON TABLE "PromoCode" FROM aera_app;
    REVOKE ALL ON TABLE "PromoCodeRedemption" FROM aera_app;
  END IF;
END $$;
