-- Aeli: Bausteine, die Inhalte der verknuepften Community zeigen
--
-- Bisher wusste eine Bio-Seite von Aera genau zwei Dinge: wie die Community
-- heisst, und ob sie gerade sendet. Alles andere musste der Creator abtippen —
-- Termine, Preise, Produkte standen dann doppelt in der Welt und liefen
-- auseinander, sobald sich eins davon aenderte.
--
-- Diese Migration oeffnet fuer die Rolle `aeli_app` einen Lesepfad auf fuenf
-- Aera-Tabellen. Der Massstab dafuer ist nicht „was waere praktisch", sondern:
--
--   Aeli darf genau das sehen, was ein abgemeldeter Besucher auf der
--   oeffentlichen Community-Seite ohnehin sehen wuerde. Keine Zeile mehr.
--
-- Durchgesetzt wird das zweifach, und das ist Absicht:
--
--   * Zeilen ueber Policies. Ein oeffentlicher Space, ein veroeffentlichtes
--     Produkt, eine oeffentliche Mitgliedsstufe — sonst nichts. Ein Fehler in
--     einer `where`-Klausel der App kann daran nichts aendern.
--   * Spalten ueber Grants. `meetingUrl`, `downloadUrl`, `streamUrl`, die
--     Stripe- und Apple-Kennungen und die Entitlement-Schluessel, die den
--     Kauf gewaehren, sind fuer `aeli_app` nicht vorhanden. Selbst eine
--     kaputte Policy koennte sie nicht ausliefern.
--
-- Der Tenant-Bezug bleibt bewusst aus den Policies heraus: welche Community
-- eine Seite zeigt, steht in `AeliProfile.linkedTenantId`, und der
-- oeffentliche Lesepfad hat dafuer keinen GUC. Er braucht ihn auch nicht —
-- was hier sichtbar wird, ist bereits oeffentlich. Die App schraenkt trotzdem
-- auf die eine verknuepfte `tenantId` ein (aeli.so/lib/aera-content.ts).

-- ---------------------------------------------------------------------------
-- Neue Bausteintypen
-- ---------------------------------------------------------------------------
-- Kein `IF NOT EXISTS`: laeuft die Migration zweimal, soll sie scheitern und
-- nicht so tun, als waere alles in Ordnung.
ALTER TYPE "AeliBlockType" ADD VALUE 'AERA_EVENTS';
ALTER TYPE "AeliBlockType" ADD VALUE 'AERA_TIERS';
ALTER TYPE "AeliBlockType" ADD VALUE 'AERA_SHOP';
ALTER TYPE "AeliBlockType" ADD VALUE 'AERA_COURSES';
ALTER TYPE "AeliBlockType" ADD VALUE 'AERA_SPACES';

-- ---------------------------------------------------------------------------
-- Spalten
-- ---------------------------------------------------------------------------
-- Jede Liste ist zweigeteilt: was die Bio-Seite anzeigt, und was die Policy
-- zum Pruefen braucht. Beides muss gewaehrt sein — ein Policy-Ausdruck laeuft
-- mit den Rechten des fragenden Rollen, nicht mit denen des Eigentuemers.

GRANT SELECT (
  "id", "tenantId", "name", "slug", "type", "icon", "description", "sortOrder",
  -- Policy:
  "visibility", "isArchived", "requiredEntitlementKey"
) ON "Space" TO aeli_app;

GRANT SELECT (
  "id", "tenantId", "spaceId", "title", "slug", "description", "coverUrl",
  "startsAt", "endsAt", "location", "isOnline",
  -- Policy:
  "requiredEntitlementKey"
) ON "Event" TO aeli_app;

GRANT SELECT (
  "id", "tenantId", "name", "slug", "description", "coverUrl", "isRecommended",
  "priceCents", "currency", "interval", "sortOrder",
  -- Policy:
  "isPublic"
) ON "MembershipTier" TO aeli_app;

GRANT SELECT (
  "id", "tenantId", "spaceId", "name", "slug", "description", "coverUrl",
  "priceCents", "currency", "type",
  -- Policy:
  "isPublished"
) ON "Product" TO aeli_app;

GRANT SELECT (
  "id", "tenantId", "spaceId", "title", "slug", "description", "coverUrl",
  -- Policy:
  "isPublished", "requiredEntitlementKey"
) ON "Course" TO aeli_app;

-- ---------------------------------------------------------------------------
-- Zeilen
-- ---------------------------------------------------------------------------
-- Die vorhandene `tenant_isolation` bleibt unberuehrt. Sie gilt zwar auch fuer
-- `aeli_app`, prueft dort aber gegen einen leeren GUC und ergibt damit NULL,
-- also unwahr. Permissive Policies werden ODER-verknuepft — entscheidend ist
-- deshalb allein die jeweils neue Policy.

-- Der Raum ist die Wurzel: ob ein Termin, ein Produkt oder ein Kurs sichtbar
-- ist, haengt daran, ob sein Raum oeffentlich ist. Deshalb steht die Bedingung
-- hier einmal ausformuliert und in den drei Kind-Policies als Unterabfrage.
--
-- `requiredEntitlementKey IS NULL` gehoert dazu: ein Raum kann PUBLIC sein und
-- trotzdem hinter einer Bezahlschranke liegen. „Sichtbar in der Navigation"
-- ist nicht dasselbe wie „lesbar".
CREATE POLICY aeli_public_space ON "Space"
  FOR SELECT
  TO aeli_app
  USING (
    "visibility" = 'PUBLIC'
    AND "isArchived" = FALSE
    AND "requiredEntitlementKey" IS NULL
    AND EXISTS (
      SELECT 1 FROM "Tenant" t
      WHERE t."id" = "Space"."tenantId" AND t."status" = 'ACTIVE'
    )
  );

CREATE POLICY aeli_public_event ON "Event"
  FOR SELECT
  TO aeli_app
  USING (
    "requiredEntitlementKey" IS NULL
    AND EXISTS (
      SELECT 1 FROM "Space" s
      WHERE s."id" = "Event"."spaceId"
        AND s."visibility" = 'PUBLIC'
        AND s."isArchived" = FALSE
        AND s."requiredEntitlementKey" IS NULL
    )
  );

-- Mitgliedsstufen haengen an keinem Raum: sie sind die Beitrittsseite selbst.
-- `isPublic` ist genau der Schalter, den der Creator dafuer umlegt.
CREATE POLICY aeli_public_tier ON "MembershipTier"
  FOR SELECT
  TO aeli_app
  USING (
    "isPublic" = TRUE
    AND EXISTS (
      SELECT 1 FROM "Tenant" t
      WHERE t."id" = "MembershipTier"."tenantId" AND t."status" = 'ACTIVE'
    )
  );

-- Ein Produkt ohne Raum taucht in Aera nirgends oeffentlich auf. Es hier zu
-- zeigen hiesse, eine Seite zu bauen, die mehr weiss als die Quelle.
CREATE POLICY aeli_public_product ON "Product"
  FOR SELECT
  TO aeli_app
  USING (
    "isPublished" = TRUE
    AND "spaceId" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "Space" s
      WHERE s."id" = "Product"."spaceId"
        AND s."visibility" = 'PUBLIC'
        AND s."isArchived" = FALSE
        AND s."requiredEntitlementKey" IS NULL
    )
  );

CREATE POLICY aeli_public_course ON "Course"
  FOR SELECT
  TO aeli_app
  USING (
    "isPublished" = TRUE
    AND "requiredEntitlementKey" IS NULL
    AND EXISTS (
      SELECT 1 FROM "Space" s
      WHERE s."id" = "Course"."spaceId"
        AND s."visibility" = 'PUBLIC'
        AND s."isArchived" = FALSE
        AND s."requiredEntitlementKey" IS NULL
    )
  );
