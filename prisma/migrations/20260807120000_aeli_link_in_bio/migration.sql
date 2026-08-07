-- Aeli — Link-in-Bio auf aeli.so
--
-- Aeli ist eine eigene Next.js-App (Ordner `aeli.so/`) auf DIESER Datenbank.
-- Es ist die erste Tabellengruppe, die nicht tenant-scoped ist: es gibt keine
-- `tenantId`, sondern einen Besitzer (`userId`) und eine Oeffentlichkeit
-- (`status = 'PUBLISHED'`).
--
-- Deshalb bekommt Aeli eine eigene Rolle statt `aera_app`:
--   * `aera_app` traegt Grants und Policies rund um `aera.tenant_id`. Eine
--     zweite Bedeutung derselben Rolle waere die Art von Vermischung, die man
--     ein Jahr spaeter nicht mehr auseinanderhaelt — und `scripts/apply-rls.ts`
--     wuerde jeden zusaetzlichen Grant zu Recht als Drift melden.
--   * `aeli_app` darf ausschliesslich die vier Aeli-Tabellen sehen, plus genau
--     die Spalten von `User`/`Tenant`, die eine Bio-Seite anzeigt.
--
-- Durchsetzung zur Laufzeit (aeli.so/lib/prisma.ts):
--     SET LOCAL ROLE aeli_app;
--     SELECT set_config('aeli.user_id', '<user-id>', TRUE);   -- nur im Studio
-- Ohne gesetzten GUC bleibt genau das sichtbar, was veroeffentlicht ist — das
-- ist der oeffentliche Lesepfad der Seite. Registrierung und Login laufen
-- weiterhin ueber die privilegierte Verbindung, weil sie `User` schreiben.

-- CreateEnum
CREATE TYPE "AeliStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "AeliBlockType" AS ENUM ('LINK', 'HEADER', 'TEXT', 'SOCIAL_ROW', 'DIVIDER', 'EMBED', 'IMAGE', 'COMMUNITY_CTA', 'NEWSLETTER', 'TIP', 'PRODUCT', 'BOOKING', 'LIVE_NOW', 'MUSIC', 'CONTACT', 'QR_SHARE');

-- CreateEnum
CREATE TYPE "AeliEventKind" AS ENUM ('VIEW', 'CLICK');

-- CreateEnum
CREATE TYPE "AeliDevice" AS ENUM ('MOBILE', 'TABLET', 'DESKTOP', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AeliGate" AS ENUM ('NONE', 'PASSWORD', 'AGE', 'EMAIL');

-- CreateTable
CREATE TABLE "AeliProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "theme" JSONB,
    "socials" JSONB,
    "status" "AeliStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "linkedTenantId" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoImageUrl" TEXT,
    "seoNoindex" BOOLEAN NOT NULL DEFAULT false,
    "gate" "AeliGate" NOT NULL DEFAULT 'NONE',
    "gatePasswordHash" TEXT,
    "smartSort" BOOLEAN NOT NULL DEFAULT false,
    "showBranding" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeliProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AeliBlock" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "AeliBlockType" NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "href" TEXT,
    "mediaUrl" TEXT,
    "icon" TEXT,
    "config" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeliBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AeliClick" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "blockId" TEXT,
    "kind" "AeliEventKind" NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrerHost" TEXT,
    "visitorHash" TEXT,
    "country" TEXT,
    "device" "AeliDevice" NOT NULL DEFAULT 'UNKNOWN',

    CONSTRAINT "AeliClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AeliLead" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "blockId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "message" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AeliLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AeliProfile_userId_key" ON "AeliProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AeliProfile_handle_key" ON "AeliProfile"("handle");

-- CreateIndex
CREATE INDEX "AeliProfile_status_publishedAt_idx" ON "AeliProfile"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "AeliProfile_linkedTenantId_idx" ON "AeliProfile"("linkedTenantId");

-- CreateIndex
CREATE INDEX "AeliBlock_profileId_sortOrder_idx" ON "AeliBlock"("profileId", "sortOrder");

-- CreateIndex
CREATE INDEX "AeliBlock_profileId_clickCount_idx" ON "AeliBlock"("profileId", "clickCount");

-- CreateIndex
CREATE INDEX "AeliClick_profileId_ts_idx" ON "AeliClick"("profileId", "ts");

-- CreateIndex
CREATE INDEX "AeliClick_profileId_kind_ts_idx" ON "AeliClick"("profileId", "kind", "ts");

-- CreateIndex
CREATE INDEX "AeliClick_blockId_ts_idx" ON "AeliClick"("blockId", "ts");

-- CreateIndex
CREATE INDEX "AeliLead_profileId_createdAt_idx" ON "AeliLead"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "AeliLead_profileId_email_idx" ON "AeliLead"("profileId", "email");

-- AddForeignKey
ALTER TABLE "AeliProfile" ADD CONSTRAINT "AeliProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AeliProfile" ADD CONSTRAINT "AeliProfile_linkedTenantId_fkey" FOREIGN KEY ("linkedTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AeliBlock" ADD CONSTRAINT "AeliBlock_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AeliProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AeliClick" ADD CONSTRAINT "AeliClick_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AeliProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AeliClick" ADD CONSTRAINT "AeliClick_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "AeliBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AeliLead" ADD CONSTRAINT "AeliLead_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AeliProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rolle `aeli_app`
-- ---------------------------------------------------------------------------
-- NOLOGIN: die Rolle wird nie verbunden, nur per SET LOCAL ROLE angenommen.
-- Ohne BYPASSRLS, ohne CREATEDB/CREATEROLE — die Attribute prueft
-- aeli.so/scripts/check-rls.ts.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aeli_app') THEN
    CREATE ROLE aeli_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- Die verbindende Rolle muss `SET ROLE aeli_app` duerfen. Ohne diese
-- Mitgliedschaft laeuft die App weiter — aber als Eigentuemer, also ohne die
-- Policies unten. Genau davor bewahrt der Check in check-rls.ts.
DO $$
BEGIN
  EXECUTE format('GRANT aeli_app TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO aeli_app;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Zwei Blickwinkel auf dieselben Tabellen, als zwei permissive Policies:
--   `aeli_owner_*`   — der eingeloggte Creator im Studio (GUC gesetzt)
--   `aeli_public_*`  — jeder Besucher der Seite (GUC leer)
-- Permissive Policies verodern sich, der Creator sieht also seinen Entwurf
-- UND alles Veroeffentlichte. Wer keinen GUC setzt, sieht nur Letzteres.

ALTER TABLE "AeliProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AeliBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AeliClick" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AeliLead" ENABLE ROW LEVEL SECURITY;

-- Profil: der Besitzer darf alles, die Oeffentlichkeit darf veroeffentlichte
-- Profile lesen.
CREATE POLICY aeli_owner_profile ON "AeliProfile"
  USING ("userId" = current_setting('aeli.user_id', true))
  WITH CHECK ("userId" = current_setting('aeli.user_id', true));

CREATE POLICY aeli_public_profile ON "AeliProfile"
  FOR SELECT
  USING ("status" = 'PUBLISHED');

-- Bloecke erben die Sichtbarkeit ihres Profils. Der Unterausdruck laeuft
-- ebenfalls unter RLS, die beiden Policies oben gelten also auch hier.
CREATE POLICY aeli_owner_block ON "AeliBlock"
  USING (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliBlock"."profileId"
      AND p."userId" = current_setting('aeli.user_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliBlock"."profileId"
      AND p."userId" = current_setting('aeli.user_id', true)
  ));

CREATE POLICY aeli_public_block ON "AeliBlock"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliBlock"."profileId" AND p."status" = 'PUBLISHED'
  ));

-- Ereignisse: der Besitzer liest seine Statistik, die oeffentliche Seite darf
-- ausschliesslich schreiben — und nur auf veroeffentlichte Profile. Ohne das
-- WITH CHECK koennte ein Beacon fremde Zahlen aufblasen.
CREATE POLICY aeli_owner_event ON "AeliClick"
  USING (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliClick"."profileId"
      AND p."userId" = current_setting('aeli.user_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliClick"."profileId"
      AND p."userId" = current_setting('aeli.user_id', true)
  ));

CREATE POLICY aeli_public_event_insert ON "AeliClick"
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliClick"."profileId" AND p."status" = 'PUBLISHED'
  ));

-- Leads: dieselbe Asymmetrie. Besucher duerfen einsenden, aber niemals lesen.
CREATE POLICY aeli_owner_lead ON "AeliLead"
  USING (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliLead"."profileId"
      AND p."userId" = current_setting('aeli.user_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliLead"."profileId"
      AND p."userId" = current_setting('aeli.user_id', true)
  ));

CREATE POLICY aeli_public_lead_insert ON "AeliLead"
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliLead"."profileId" AND p."status" = 'PUBLISHED'
  ));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON "AeliProfile" TO aeli_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AeliBlock" TO aeli_app;
-- Das Ereignis-Log ist append-only: kein UPDATE, kein DELETE. Aufraeumen
-- passiert ueber die privilegierte Verbindung.
GRANT SELECT, INSERT ON "AeliClick" TO aeli_app;
-- Leads darf der Creator loeschen (Auskunfts-/Loeschbegehren), aber nicht
-- nachtraeglich umschreiben.
GRANT SELECT, INSERT, DELETE ON "AeliLead" TO aeli_app;

-- Fremde Tabellen: nur die Spalten, die eine Bio-Seite tatsaechlich zeigt.
GRANT SELECT ("id", "name", "slug", "subdomain", "customDomain", "logoUrl", "tagline", "primaryColor", "accentColor", "status") ON "Tenant" TO aeli_app;

-- `Tenant` traegt bereits RLS mit einer Policy auf `aera.tenant_id`. Fuer
-- `aeli_app` bleibt der GUC leer, die Policy also falsch — die Bruecke braucht
-- daher einen eigenen Lesepfad: aktive Communities, mehr nicht.
CREATE POLICY aeli_public_tenant ON "Tenant"
  FOR SELECT
  TO aeli_app
  USING ("status" = 'ACTIVE');

-- Auf `User` bekommt `aeli_app` bewusst GAR KEINEN Zugriff — auch nicht auf
-- Name und Avatar. Grund ist nicht Zurueckhaltung, sondern Mechanik:
-- permissive Policies werden alle ausgewertet, und Aeras vorhandene
-- `tenant_member_users_select` liest dabei `Membership`. Ein Lesepfad fuer
-- Aeli haette also entweder `Membership` mit oeffnen muessen, oder er waere an
-- dessen fehlendem Grant gescheitert.
--
-- Es fehlt auch nichts: `AeliProfile` traegt `displayName` und `avatarUrl`
-- selbst, und Registrierung/Login schreiben `User` ohnehin ueber die
-- privilegierte Verbindung (aeli.so/lib/prisma.ts: systemPrisma).
