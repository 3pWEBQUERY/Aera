-- Reddit-style voting on member wishes.

ALTER TABLE "MemberRequest" ADD COLUMN IF NOT EXISTS "score" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "RequestVote" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "value"     INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RequestVote_requestId_userId_key" ON "RequestVote" ("requestId", "userId");
CREATE INDEX IF NOT EXISTS "RequestVote_tenantId_requestId_idx" ON "RequestVote" ("tenantId", "requestId");
CREATE INDEX IF NOT EXISTS "MemberRequest_tenantId_spaceId_score_idx" ON "MemberRequest" ("tenantId", "spaceId", "score");

DO $$ BEGIN
  ALTER TABLE "RequestVote" ADD CONSTRAINT "RequestVote_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RequestVote" ADD CONSTRAINT "RequestVote_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "MemberRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RequestVote" ADD CONSTRAINT "RequestVote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
