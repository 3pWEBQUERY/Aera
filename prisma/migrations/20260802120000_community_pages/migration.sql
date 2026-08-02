-- Frei gebaute Seiten einer Community ("Ueber uns", "FAQ", …). Eigene Tabelle
-- statt eines weiteren Felds in "Tenant"."layout": die Layout-Vorschau reicht
-- ihren Stand als Cookie weiter (~4 KB Grenze), und ein einziger Textbaustein
-- sprengt das bereits.
CREATE TYPE "CommunityPageStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "CommunityPage" (
  "id"                     TEXT NOT NULL,
  "tenantId"               TEXT NOT NULL,
  "slug"                   TEXT NOT NULL,
  "title"                  TEXT NOT NULL,
  "description"            TEXT,
  "status"                 "CommunityPageStatus" NOT NULL DEFAULT 'DRAFT',
  "visibility"             "Visibility" NOT NULL DEFAULT 'PUBLIC',
  "requiredEntitlementKey" TEXT,
  "showInNav"              BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"              INTEGER NOT NULL DEFAULT 0,
  "blocks"                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunityPage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunityPage_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CommunityPage_tenantId_slug_key" ON "CommunityPage"("tenantId", "slug");
-- Traegt die Abfrage des Reitermenues: veroeffentlichte Seiten einer Community
-- in Anzeigereihenfolge.
CREATE INDEX "CommunityPage_tenantId_status_sortOrder_idx"
  ON "CommunityPage"("tenantId", "status", "sortOrder");

-- Mandantentrennung. Bewusst ausserhalb jeder Rollenpruefung: faende sich die
-- Rolle nicht, bliebe die Tabelle sonst still ohne RLS zurueck.
ALTER TABLE public."CommunityPage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public."CommunityPage"
  USING ("tenantId" = current_setting('aera.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('aera.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aera_app') THEN
    REVOKE ALL ON TABLE public."CommunityPage" FROM PUBLIC, aera_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."CommunityPage" TO aera_app;
  END IF;
END
$$;
