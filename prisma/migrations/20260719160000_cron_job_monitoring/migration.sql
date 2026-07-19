-- One privileged heartbeat row per background job. This table deliberately
-- has no tenantId and receives no aera_app grants: cron orchestration is a
-- platform operation and must stay on the explicit system connection.
CREATE TYPE "CronJobStatus" AS ENUM ('IDLE', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "CronJobHeartbeat" (
  "job" TEXT NOT NULL,
  "status" "CronJobStatus" NOT NULL DEFAULT 'IDLE',
  "lastStartedAt" TIMESTAMP(3),
  "lastSucceededAt" TIMESTAMP(3),
  "lastFailedAt" TIMESTAMP(3),
  "lastDurationMs" INTEGER,
  "lastCounters" JSONB NOT NULL DEFAULT '{}',
  "lastError" TEXT,
  "totalRuns" INTEGER NOT NULL DEFAULT 0,
  "totalSucceeded" INTEGER NOT NULL DEFAULT 0,
  "totalFailed" INTEGER NOT NULL DEFAULT 0,
  "runToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CronJobHeartbeat_pkey" PRIMARY KEY ("job")
);

CREATE INDEX "CronJobHeartbeat_status_updatedAt_idx"
  ON "CronJobHeartbeat"("status", "updatedAt");

REVOKE ALL ON TABLE "CronJobHeartbeat" FROM PUBLIC, aera_app;
