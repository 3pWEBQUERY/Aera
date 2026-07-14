-- Folder accent color (hex string), used by the media library folder cards.
ALTER TABLE "MediaFolder" ADD COLUMN IF NOT EXISTS "color" TEXT NOT NULL DEFAULT '#C2410C';
