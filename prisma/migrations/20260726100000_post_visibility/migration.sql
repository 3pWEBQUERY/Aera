-- Sichtbarkeit je Beitrag. Bisher kannte ein Beitrag nur "kostenlos" oder
-- "kostet X" — "nur fuer Mitglieder" liess sich gar nicht ausdruecken.
-- Bestehende Beitraege bleiben oeffentlich; wer bezahlt werden musste, war
-- schon ueber priceCents/entitlementKey gesperrt und bleibt es.
ALTER TABLE "Post" ADD COLUMN "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC';

-- Bezahlte Beitraege tragen die Sichtbarkeit jetzt auch explizit, damit
-- Abfragen nicht mehr ueber den Preis auf die Sperre schliessen muessen.
UPDATE "Post" SET "visibility" = 'PAID' WHERE "priceCents" > 0;

CREATE INDEX "Post_spaceId_visibility_idx" ON "Post"("spaceId", "visibility");
