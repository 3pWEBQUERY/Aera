-- Streams, die über Aera selbst laufen (Cloudflare Stream Live).
CREATE TYPE "LiveSource" AS ENUM ('EXTERNAL', 'AERA');
CREATE TYPE "LiveIngest" AS ENUM ('BROWSER', 'OBS');

ALTER TABLE "LiveSession"
  ADD COLUMN "source" "LiveSource" NOT NULL DEFAULT 'EXTERNAL',
  ADD COLUMN "ingest" "LiveIngest" NOT NULL DEFAULT 'BROWSER',
  ADD COLUMN "cfInputId" TEXT,
  ADD COLUMN "cfReplayId" TEXT;

-- Ein Live-Input gehört zu genau einer Session; ein zweiter Verweis darauf
-- wäre ein Fehler, den man sonst erst beim Löschen bemerkt.
CREATE UNIQUE INDEX "LiveSession_cfInputId_key" ON "LiveSession"("cfInputId");
