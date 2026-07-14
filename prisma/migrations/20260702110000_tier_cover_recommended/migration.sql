-- Patreon-style membership cards: per-tier cover image + creator recommendation.
ALTER TABLE "MembershipTier" ADD COLUMN "coverUrl" TEXT;
ALTER TABLE "MembershipTier" ADD COLUMN "isRecommended" BOOLEAN NOT NULL DEFAULT false;
