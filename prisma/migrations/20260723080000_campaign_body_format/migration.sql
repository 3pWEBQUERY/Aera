-- Kampagnen-Inhalt: Format-Umschalter Text/HTML (bodyFormat).
-- Idempotent formuliert, weil Dev und Produktion dieselbe Datenbank nutzen und
-- die Spalte dort bereits vor dem Deploy angelegt wurde.
DO $$ BEGIN
  CREATE TYPE "CampaignBodyFormat" AS ENUM ('TEXT', 'HTML');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "NewsletterCampaign"
  ADD COLUMN IF NOT EXISTS "bodyFormat" "CampaignBodyFormat" NOT NULL DEFAULT 'TEXT';
