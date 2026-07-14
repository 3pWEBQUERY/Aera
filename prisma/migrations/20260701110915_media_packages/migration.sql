-- CreateTable
CREATE TABLE "MediaPackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "entitlementKey" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaPackage_tenantId_spaceId_idx" ON "MediaPackage"("tenantId", "spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaPackage_tenantId_slug_key" ON "MediaPackage"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "MediaItem_tenantId_packageId_idx" ON "MediaItem"("tenantId", "packageId");

-- AddForeignKey
ALTER TABLE "MediaPackage" ADD CONSTRAINT "MediaPackage_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaItem" ADD CONSTRAINT "MediaItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "MediaPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
