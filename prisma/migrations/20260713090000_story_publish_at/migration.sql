-- Story scheduling: go-live time. Existing rows go live at creation.
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "publishAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing rows so their publish time matches their creation time.
UPDATE "Story" SET "publishAt" = "createdAt" WHERE "publishAt" > "createdAt";

CREATE INDEX IF NOT EXISTS "Story_tenantId_publishAt_idx" ON "Story" ("tenantId", "publishAt");
