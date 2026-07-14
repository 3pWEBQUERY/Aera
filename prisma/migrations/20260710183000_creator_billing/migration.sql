-- Creator-plan subscription state is kept on the tenant's single AI wallet.
ALTER TABLE "AiCreditWallet"
  ALTER COLUMN "plan" SET DEFAULT 'FREE',
  ALTER COLUMN "monthlyCredits" SET DEFAULT 500,
  ALTER COLUMN "includedRemaining" SET DEFAULT 500,
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "creatorSubscriptionStatus" "SubscriptionStatus",
  ADD COLUMN "planCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "planCurrentPeriodEnd" TIMESTAMP(3);

CREATE UNIQUE INDEX "AiCreditWallet_stripeSubscriptionId_key"
  ON "AiCreditWallet"("stripeSubscriptionId");

-- A Stripe Checkout Session may grant a credit pack exactly once.
ALTER TABLE "AiCreditPurchase"
  ADD COLUMN "packId" TEXT,
  ADD COLUMN "stripeSessionId" TEXT,
  ADD COLUMN "stripePaymentIntentId" TEXT;

CREATE UNIQUE INDEX "AiCreditPurchase_stripeSessionId_key"
  ON "AiCreditPurchase"("stripeSessionId");
