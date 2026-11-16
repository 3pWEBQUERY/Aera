-- Indizes für häufige Abfragen (Qualitätsanalyse Runde 3, Paket Performance).
-- Nur Indizes: keine Tabellen, Spalten, Grants oder RLS-Policies.

-- Tenant.slug ist bereits @unique (Tenant_slug_key); der zusätzliche Index war doppelt.
DROP INDEX IF EXISTS "Tenant_slug_idx";

-- Space-Feed: veröffentlichte Beiträge eines Space, neueste zuerst. Ersetzt den
-- (tenantId, spaceId)-Index, der als Präfix des neuen Index abgedeckt bleibt.
DROP INDEX IF EXISTS "Post_tenantId_spaceId_idx";
CREATE INDEX "Post_tenantId_spaceId_isPublished_publishedAt_idx" ON "Post"("tenantId", "spaceId", "isPublished", "publishedAt" DESC);

-- Cron lib/scheduled-posts.ts: isPublished = false AND scheduledAt <= now().
CREATE INDEX "Post_isPublished_scheduledAt_idx" ON "Post"("isPublished", "scheduledAt");

-- Mitglieder- und Abo-Zählungen je Community nach Status.
CREATE INDEX "Membership_tenantId_status_idx" ON "Membership"("tenantId", "status");
CREATE INDEX "Subscription_tenantId_status_idx" ON "Subscription"("tenantId", "status");
