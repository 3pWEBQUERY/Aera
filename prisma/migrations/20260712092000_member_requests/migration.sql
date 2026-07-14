-- REQUESTS space: member wishes / custom requests
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'ACCEPTED', 'PRICED', 'FULFILLED', 'DECLINED');

CREATE TABLE "MemberRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "entitlementKey" TEXT,
    "staffNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemberRequest_tenantId_spaceId_idx" ON "MemberRequest"("tenantId", "spaceId");
CREATE INDEX "MemberRequest_tenantId_requesterId_idx" ON "MemberRequest"("tenantId", "requesterId");

ALTER TABLE "MemberRequest" ADD CONSTRAINT "MemberRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberRequest" ADD CONSTRAINT "MemberRequest_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberRequest" ADD CONSTRAINT "MemberRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
