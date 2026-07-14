-- Phase 1: Pay-per-view / pay-per-post + scheduling
-- Idempotent (IF NOT EXISTS) so a re-run after a partial deploy still succeeds.

-- Post: scheduling + per-post paywall
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "priceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'eur';
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "entitlementKey" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "teaserUrl" TEXT;

-- MediaPackage: optional campaign end
ALTER TABLE "MediaPackage" ADD COLUMN IF NOT EXISTS "availableUntil" TIMESTAMP(3);

-- MediaItem: per-item pay-per-view
ALTER TABLE "MediaItem" ADD COLUMN IF NOT EXISTS "priceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MediaItem" ADD COLUMN IF NOT EXISTS "entitlementKey" TEXT;
ALTER TABLE "MediaItem" ADD COLUMN IF NOT EXISTS "teaserUrl" TEXT;
ALTER TABLE "MediaItem" ADD COLUMN IF NOT EXISTS "isPreview" BOOLEAN NOT NULL DEFAULT false;
