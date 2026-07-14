-- Trigram-Indizes für die Community-Suche (ILIKE '%…%' auf großen Tabellen).
-- pg_trgm ist eine Standard-Extension und auf Railway Postgres verfügbar.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Post_title_trgm_idx"
  ON "Post" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Post_body_trgm_idx"
  ON "Post" USING GIN ("body" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "KnowledgeArticle_title_trgm_idx"
  ON "KnowledgeArticle" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "KnowledgeArticle_body_trgm_idx"
  ON "KnowledgeArticle" USING GIN ("body" gin_trgm_ops);
