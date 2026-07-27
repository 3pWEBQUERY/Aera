-- Mehrere Bilder je Beitrag. `imageUrl` bleibt bestehen und traegt weiterhin
-- das erste Bild, damit jede vorhandene Abfrage unveraendert funktioniert.
ALTER TABLE "Post" ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Bestandsbeitraege: das vorhandene Einzelbild wird zum ersten Eintrag.
UPDATE "Post" SET "imageUrls" = ARRAY["imageUrl"] WHERE "imageUrl" IS NOT NULL;
