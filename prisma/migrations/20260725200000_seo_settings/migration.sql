-- SEO: Overrides je Community am Tenant, Plattform-SEO in einer eigenen Zeile.
--
-- Die Tenant-Spalten sind bewusst nullable: leer heisst "aus den Community-
-- Angaben ableiten" (siehe lib/seo.ts), nicht "leeres Meta-Tag ausliefern".
ALTER TABLE "Tenant"
  ADD COLUMN "seoTitle"       TEXT,
  ADD COLUMN "seoDescription" TEXT,
  ADD COLUMN "seoKeywords"    TEXT,
  ADD COLUMN "seoImageUrl"    TEXT,
  ADD COLUMN "seoNoindex"     BOOLEAN NOT NULL DEFAULT false;

-- Der Creator pflegt diese Felder im Dashboard, also ueber die tenant-scoped
-- Verbindung. Ohne Spalten-Grant scheitert das Speichern an der RLS.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aera_app') THEN
    GRANT UPDATE (
      "seoTitle", "seoDescription", "seoKeywords", "seoImageUrl", "seoNoindex"
    ) ON TABLE public."Tenant" TO aera_app;
  END IF;
END $$;

-- Plattform-SEO: genau eine Zeile. Keine tenantId — die Tabelle bleibt
-- ausserhalb der Tenant-RLS und wird nur privilegiert geschrieben.
CREATE TABLE "PlatformSeo" (
  "id"            TEXT NOT NULL DEFAULT 'platform',
  "siteName"      TEXT,
  "title"         TEXT,
  "titleTemplate" TEXT,
  "description"   TEXT,
  "keywords"      TEXT,
  "imageUrl"      TEXT,
  "twitterHandle" TEXT,
  "noindex"       BOOLEAN NOT NULL DEFAULT false,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "updatedById"   TEXT,
  CONSTRAINT "PlatformSeo_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlatformSeo"
  ADD CONSTRAINT "PlatformSeo_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aera_app') THEN
    REVOKE ALL ON TABLE "PlatformSeo" FROM aera_app;
  END IF;
END $$;
