-- Womit gesendet wird: aus dem Browser (WebRTC/WHIP) oder mit einer
-- Sendesoftware (RTMPS).
--
-- Eigene Migration statt einer Ergänzung von 20260729100000: die lief
-- produktiv bereits durch, und eine nachträglich geänderte Migration führt
-- Prisma nicht erneut aus. Bewusst idempotent, damit sie auch dort greift,
-- wo die vorige Fassung schon Teile davon angelegt hatte.
DO $$
BEGIN
  CREATE TYPE "LiveIngest" AS ENUM ('BROWSER', 'OBS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "LiveSession"
  ADD COLUMN IF NOT EXISTS "ingest" "LiveIngest" NOT NULL DEFAULT 'BROWSER';

-- Die drei Spalten aus 20260729100000 noch einmal absichern: wer die
-- geänderte Fassung jener Migration angewendet hat, hat sie bereits; wer die
-- ursprüngliche hatte, bekommt sie hier. Beides endet im selben Zustand.
ALTER TABLE "LiveSession"
  ADD COLUMN IF NOT EXISTS "cfInputId" TEXT,
  ADD COLUMN IF NOT EXISTS "cfReplayId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "LiveSession_cfInputId_key" ON "LiveSession"("cfInputId");
