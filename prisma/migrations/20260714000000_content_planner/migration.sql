-- Standalone content planner.

DO $$ BEGIN
  CREATE TYPE "ContentPlanType" AS ENUM ('POST','VIDEO','STREAM','STORY','NEWSLETTER','EVENT','PRODUCT_DROP','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ContentPlanStatus" AS ENUM ('DRAFT','PLANNED','IN_PROGRESS','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContentPlan" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "type"        "ContentPlanType" NOT NULL DEFAULT 'POST',
  "status"      "ContentPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "spaceId"     TEXT,
  "checklist"   JSONB,
  "aiNotes"     TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContentPlanMedia" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "planId"          TEXT NOT NULL,
  "storageObjectId" TEXT,
  "url"             TEXT NOT NULL,
  "contentType"     TEXT,
  "caption"         TEXT,
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentPlanMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentPlan_tenantId_status_scheduledAt_idx" ON "ContentPlan" ("tenantId", "status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "ContentPlan_tenantId_scheduledAt_idx" ON "ContentPlan" ("tenantId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "ContentPlanMedia_tenantId_planId_idx" ON "ContentPlanMedia" ("tenantId", "planId");
CREATE INDEX IF NOT EXISTS "ContentPlanMedia_planId_idx" ON "ContentPlanMedia" ("planId");

DO $$ BEGIN
  ALTER TABLE "ContentPlan" ADD CONSTRAINT "ContentPlan_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContentPlan" ADD CONSTRAINT "ContentPlan_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContentPlanMedia" ADD CONSTRAINT "ContentPlanMedia_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContentPlanMedia" ADD CONSTRAINT "ContentPlanMedia_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "ContentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
