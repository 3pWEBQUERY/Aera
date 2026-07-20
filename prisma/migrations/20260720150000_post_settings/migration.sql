-- Per-post settings authored in the composer's "Settings" panel. All additive
-- and backwards-compatible: existing posts keep default behaviour.

ALTER TABLE "Post"
  ADD COLUMN "customSlug" TEXT,
  ADD COLUMN "customHtml" TEXT,
  ADD COLUMN "hideComments" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "closeComments" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hideLikes" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hideMetaInfo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hideFromFeatured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "disableTruncation" BOOLEAN NOT NULL DEFAULT false;

-- Custom slugs are unique within a tenant (NULLs are distinct in Postgres, so
-- posts without a custom slug are unaffected).
CREATE UNIQUE INDEX "Post_tenantId_customSlug_key" ON "Post"("tenantId", "customSlug");
