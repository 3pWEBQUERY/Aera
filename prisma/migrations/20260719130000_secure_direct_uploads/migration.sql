CREATE TYPE "StorageUploadStatus" AS ENUM ('RESERVED', 'COMPLETED', 'FAILED', 'EXPIRED');

CREATE TABLE "StorageUploadReservation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "visibility" "StorageVisibility" NOT NULL,
  "status" "StorageUploadStatus" NOT NULL DEFAULT 'RESERVED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorageUploadReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StorageUploadReservation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StorageUploadReservation_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StorageUploadReservation_sizeBytes_check" CHECK ("sizeBytes" > 0)
);

CREATE UNIQUE INDEX "StorageUploadReservation_key_key"
  ON "StorageUploadReservation"("key");
CREATE INDEX "StorageUploadReservation_tenantId_status_expiresAt_idx"
  ON "StorageUploadReservation"("tenantId", "status", "expiresAt");
CREATE INDEX "StorageUploadReservation_ownerId_createdAt_idx"
  ON "StorageUploadReservation"("ownerId", "createdAt");

ALTER TABLE "StorageUploadReservation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StorageUploadReservation"
  USING ("tenantId" = NULLIF(current_setting('aera.tenant_id', true), ''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('aera.tenant_id', true), ''));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aera_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "StorageUploadReservation" TO aera_app;
  END IF;
END $$;
