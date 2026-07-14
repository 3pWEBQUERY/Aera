-- Enforce unique community names (case-sensitive at the DB level; the app layer
-- additionally checks case-insensitively before writes).
CREATE UNIQUE INDEX "Tenant_name_key" ON "Tenant"("name");
