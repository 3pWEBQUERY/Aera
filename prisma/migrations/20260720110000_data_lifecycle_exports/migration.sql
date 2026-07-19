CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DELETING', 'DELETED');
CREATE TYPE "DataDeletionScope" AS ENUM ('TENANT', 'USER');
CREATE TYPE "DataDeletionStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'RETRYING', 'BLOCKED', 'COMPLETED'
);
CREATE TYPE "ObjectDeletionStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'RETRYING', 'COMPLETED', 'EXHAUSTED'
);

ALTER TABLE "User"
  ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "AuditLog"
  ADD COLUMN "tenantScopeHash" TEXT,
  ADD COLUMN "retentionUntil" TIMESTAMP(3);

CREATE INDEX "AuditLog_tenantScopeHash_retentionUntil_idx"
  ON "AuditLog"("tenantScopeHash", "retentionUntil");

CREATE TABLE "DataDeletionJob" (
  "id" TEXT NOT NULL,
  "scope" "DataDeletionScope" NOT NULL,
  "targetId" TEXT NOT NULL,
  "requestedById" TEXT,
  "targetLabel" TEXT,
  "status" "DataDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "phase" TEXT NOT NULL DEFAULT 'BILLING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "counters" JSONB NOT NULL DEFAULT '{}',
  "objectScanCursor" TEXT,
  "objectScanComplete" BOOLEAN NOT NULL DEFAULT FALSE,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataDeletionJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DataDeletionJob_scope_targetId_key"
  ON "DataDeletionJob"("scope", "targetId");
CREATE INDEX "DataDeletionJob_status_nextAttemptAt_idx"
  ON "DataDeletionJob"("status", "nextAttemptAt");

CREATE TABLE "ObjectDeletionTask" (
  "id" TEXT NOT NULL,
  "jobId" TEXT,
  "tenantId" TEXT,
  "key" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "ObjectDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ObjectDeletionTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ObjectDeletionTask_key_key" ON "ObjectDeletionTask"("key");
CREATE INDEX "ObjectDeletionTask_jobId_status_idx"
  ON "ObjectDeletionTask"("jobId", "status");
CREATE INDEX "ObjectDeletionTask_status_nextAttemptAt_idx"
  ON "ObjectDeletionTask"("status", "nextAttemptAt");
CREATE INDEX "ObjectDeletionTask_tenantId_status_idx"
  ON "ObjectDeletionTask"("tenantId", "status");
ALTER TABLE "ObjectDeletionTask"
  ADD CONSTRAINT "ObjectDeletionTask_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "DataDeletionJob"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "StorageReconciliationState" (
  "tenantId" TEXT NOT NULL,
  "continuationToken" TEXT,
  "scanStartedAt" TIMESTAMP(3),
  "lastCompletedAt" TIMESTAMP(3),
  "lastScanned" INTEGER NOT NULL DEFAULT 0,
  "lastOrphans" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorageReconciliationState_pkey" PRIMARY KEY ("tenantId")
);

CREATE TABLE "BillingRetentionRecord" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "tenantScopeHash" TEXT NOT NULL,
  "subjectHash" TEXT,
  "payload" JSONB NOT NULL,
  "retainUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingRetentionRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingRetentionRecord_source_sourceId_key"
  ON "BillingRetentionRecord"("source", "sourceId");
CREATE INDEX "BillingRetentionRecord_tenantScopeHash_retainUntil_idx"
  ON "BillingRetentionRecord"("tenantScopeHash", "retainUntil");
CREATE INDEX "BillingRetentionRecord_retainUntil_idx"
  ON "BillingRetentionRecord"("retainUntil");

-- Lifecycle/retention tables are privileged platform state, never tenant CRUD.
REVOKE ALL ON TABLE "DataDeletionJob" FROM PUBLIC, aera_app;
REVOKE ALL ON TABLE "ObjectDeletionTask" FROM PUBLIC, aera_app;
REVOKE ALL ON TABLE "StorageReconciliationState" FROM PUBLIC, aera_app;
REVOKE ALL ON TABLE "BillingRetentionRecord" FROM PUBLIC, aera_app;
