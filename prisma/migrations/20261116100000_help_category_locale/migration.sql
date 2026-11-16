-- HelpCategory.locale stand im Schema (Hilfe-Center je Sprache), aber keine
-- Migration legte die Spalte an: /hilfe brach mit "column does not exist" ab.
-- Idempotent, damit Datenbanken, in denen sie von Hand nachgezogen wurde,
-- nicht scheitern. Bestehende Kategorien gelten als Deutsch (Standard).
ALTER TABLE "HelpCategory" ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'de';

-- Ein Slug ist jetzt je Sprache eindeutig, nicht mehr global.
DROP INDEX IF EXISTS "HelpCategory_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "HelpCategory_locale_slug_key" ON "HelpCategory"("locale", "slug");
CREATE INDEX IF NOT EXISTS "HelpCategory_locale_sortOrder_idx" ON "HelpCategory"("locale", "sortOrder");
