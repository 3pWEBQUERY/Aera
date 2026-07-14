-- Add discover category to tenants (key from lib/categories.ts).
ALTER TABLE "Tenant" ADD COLUMN "category" TEXT;

-- Category browsing on /home filters by this column.
CREATE INDEX "Tenant_category_idx" ON "Tenant"("category");
