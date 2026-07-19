-- Keep the creator subdomain in Prisma's migration history. This column was
-- previously created only by scripts/add-subdomain-column.sql, which meant a
-- fresh database reached the RLS grants without the referenced column.
ALTER TABLE public."Tenant"
  ADD COLUMN IF NOT EXISTS "subdomain" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_subdomain_key"
  ON public."Tenant"("subdomain");
