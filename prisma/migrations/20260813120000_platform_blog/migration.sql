-- Der Blog von Aera selbst.
--
-- Bewusst ohne "tenantId" und ohne RLS-Policy: die Tabelle gehoert der
-- Plattform, nicht einer Community. Sie wird deshalb auch nicht an die Rolle
-- `aera_app` vergeben — Lesen und Schreiben laeuft ueber den Besitzer-Zugang,
-- also ueber Anfragen ohne Tenant-Kontext (Marketing-Seiten, Admin-Bereich).
-- Genauso ist es bei "PlatformSeo", "HelpArticle" und "SupportTicket".

CREATE TYPE "PlatformPostStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "PlatformPost" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'de',
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "bodyHtml" TEXT NOT NULL,
    "coverUrl" TEXT,
    "coverAlt" TEXT,
    "category" TEXT,
    "status" "PlatformPostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "readingMinutes" INTEGER NOT NULL DEFAULT 1,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPost_pkey" PRIMARY KEY ("id")
);

-- Die Adresse eines Beitrags ist pro Sprache eindeutig. Derselbe Beitrag darf
-- auf Deutsch und Englisch denselben Slug tragen; zwei deutsche nicht.
CREATE UNIQUE INDEX "PlatformPost_locale_slug_key" ON "PlatformPost"("locale", "slug");

-- Die Uebersicht fragt immer "Sprache + veroeffentlicht + nach Datum".
CREATE INDEX "PlatformPost_locale_status_publishedAt_idx" ON "PlatformPost"("locale", "status", "publishedAt");

-- Feed und Sitemap fragen ueber alle Sprachen hinweg.
CREATE INDEX "PlatformPost_status_publishedAt_idx" ON "PlatformPost"("status", "publishedAt");

-- Ein geloeschtes Konto nimmt den Beitrag nicht mit: der Text bleibt, nur die
-- Zeile darunter verliert ihren Namen.
ALTER TABLE "PlatformPost"
  ADD CONSTRAINT "PlatformPost_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
