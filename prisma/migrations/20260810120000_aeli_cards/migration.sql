-- Aeli: aus einer Seite wird ein Stapel
--
-- Bisher war eine Bio-Seite eine Spalte Bausteine. Jetzt ist sie ein Stapel
-- Karten — „Start", „Musik", „Shop" — zwischen denen der Besucher wischt.
-- Jede Karte hat eigene Bausteine, eine eigene Adresse und optional ein
-- eigenes Aussehen.
--
-- Der heikle Teil dieser Migration ist nicht die neue Tabelle, sondern der
-- Umzug: `AeliBlock.cardId` ist NOT NULL, und es gibt bereits Bausteine. Die
-- Reihenfolge unten ist deshalb keine Stilfrage —
--
--   1. Spalte nullbar anlegen
--   2. fuer JEDES Profil eine Startkarte erzeugen
--   3. alle Bausteine dorthin umhaengen
--   4. erst dann NOT NULL und Fremdschluessel
--
-- Umgekehrt scheiterte Schritt 1 an der bestehenden Zeile, und ein
-- `DEFAULT` waere hier keine Loesung, sondern eine falsche Karte.

-- ---------------------------------------------------------------------------
-- Karten
-- ---------------------------------------------------------------------------
CREATE TABLE "AeliCard" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "theme" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeliCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AeliCard_profileId_slug_key" ON "AeliCard"("profileId", "slug");
CREATE INDEX "AeliCard_profileId_sortOrder_idx" ON "AeliCard"("profileId", "sortOrder");

ALTER TABLE "AeliCard"
  ADD CONSTRAINT "AeliCard_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "AeliProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Umzug
-- ---------------------------------------------------------------------------
ALTER TABLE "AeliBlock" ADD COLUMN "cardId" TEXT;

-- Eine Startkarte je Profil. Ihr Titel ist „Start", nicht der Name des
-- Creators: der Reiter beschriftet einen Abschnitt, nicht die Person.
INSERT INTO "AeliCard" ("id", "profileId", "slug", "title", "sortOrder", "updatedAt")
SELECT
  -- Deterministisch aus der Profil-ID, damit ein zweiter Lauf dieselbe Karte
  -- traefe statt eine zweite anzulegen.
  'card_' || md5(p."id"),
  p."id",
  'start',
  'Start',
  0,
  now()
FROM "AeliProfile" p;

UPDATE "AeliBlock" b
SET "cardId" = c."id"
FROM "AeliCard" c
WHERE c."profileId" = b."profileId" AND c."slug" = 'start';

ALTER TABLE "AeliBlock" ALTER COLUMN "cardId" SET NOT NULL;

ALTER TABLE "AeliBlock"
  ADD CONSTRAINT "AeliBlock_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "AeliCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AeliBlock_cardId_sortOrder_idx" ON "AeliBlock"("cardId", "sortOrder");

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Karten erben die Sichtbarkeit ihres Profils, genau wie Bausteine. Der
-- Unterausdruck laeuft ebenfalls unter RLS.
ALTER TABLE "AeliCard" ENABLE ROW LEVEL SECURITY;

CREATE POLICY aeli_owner_card ON "AeliCard"
  USING (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliCard"."profileId"
      AND p."userId" = current_setting('aeli.user_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliCard"."profileId"
      AND p."userId" = current_setting('aeli.user_id', true)
  ));

-- Versteckte Karten sind nicht oeffentlich. Das steht hier und nicht in einer
-- `where`-Klausel der App: eine Karte, an der jemand noch arbeitet, soll auch
-- dann nicht ausgeliefert werden, wenn eine Abfrage sie vergisst.
CREATE POLICY aeli_public_card ON "AeliCard"
  FOR SELECT
  USING (
    "isVisible" = TRUE
    AND EXISTS (
      SELECT 1 FROM "AeliProfile" p
      WHERE p."id" = "AeliCard"."profileId" AND p."status" = 'PUBLISHED'
    )
  );

-- Und derselbe Gedanke eine Ebene tiefer: ein Baustein auf einer versteckten
-- Karte ist nicht oeffentlich, auch wenn sein Profil es ist. Die bisherige
-- Policy kannte nur das Profil.
DROP POLICY IF EXISTS aeli_public_block ON "AeliBlock";
CREATE POLICY aeli_public_block ON "AeliBlock"
  FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM "AeliProfile" p
    JOIN "AeliCard" c ON c."id" = "AeliBlock"."cardId"
    WHERE p."id" = "AeliBlock"."profileId"
      AND p."status" = 'PUBLISHED'
      AND c."isVisible" = TRUE
  ));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON "AeliCard" TO aeli_app;
