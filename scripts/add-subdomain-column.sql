-- Tenant.subdomain: vom Creator wählbare Wunsch-Subdomain (<sub>.aera.so). Idempotent.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subdomain" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_subdomain_key" ON "Tenant"("subdomain");
