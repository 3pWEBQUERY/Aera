-- Streams, die über Aera selbst laufen (Cloudflare Stream Live).
CREATE TYPE "LiveSource" AS ENUM ('EXTERNAL', 'AERA');

ALTER TABLE "LiveSession"
  ADD COLUMN "source" "LiveSource" NOT NULL DEFAULT 'EXTERNAL',
  ADD COLUMN "cfInputId" TEXT,
  ADD COLUMN "cfReplayId" TEXT;

-- Ein Live-Input gehört zu genau einer Session; ein zweiter Verweis darauf
-- wäre ein Fehler, den man sonst erst beim Löschen bemerkt.
CREATE UNIQUE INDEX "LiveSession_cfInputId_key" ON "LiveSession"("cfInputId");
