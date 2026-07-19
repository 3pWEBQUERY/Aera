-- Platform administration must be authorized by durable database state.
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "User"
  ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- Tenant lifecycle state closes public/studio access without deleting the
-- records that payment webhooks and cleanup jobs still need.
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETING');
ALTER TABLE "Tenant"
  ADD COLUMN "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");
CREATE INDEX "Membership_userId_status_role_idx"
  ON "Membership"("userId", "status", "role");
