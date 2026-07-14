-- BOOKING, STORIES, TIPS spaces + TIP gamification trigger

ALTER TYPE "GamificationTrigger" ADD VALUE IF NOT EXISTS 'TIP';

CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "TipStatus" AS ENUM ('PENDING', 'PAID');

CREATE TABLE "BookingSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingSlot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookingSlot_tenantId_spaceId_idx" ON "BookingSlot"("tenantId", "spaceId");
CREATE INDEX "BookingSlot_tenantId_startsAt_idx" ON "BookingSlot"("tenantId", "startsAt");

CREATE TABLE "BookingReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingReservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookingReservation_tenantId_slotId_idx" ON "BookingReservation"("tenantId", "slotId");
CREATE INDEX "BookingReservation_tenantId_userId_idx" ON "BookingReservation"("tenantId", "userId");

CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "caption" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Story_tenantId_spaceId_idx" ON "Story"("tenantId", "spaceId");
CREATE INDEX "Story_tenantId_expiresAt_idx" ON "Story"("tenantId", "expiresAt");

CREATE TABLE "Tip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "message" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "status" "TipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tip_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Tip_tenantId_spaceId_idx" ON "Tip"("tenantId", "spaceId");

ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingReservation" ADD CONSTRAINT "BookingReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingReservation" ADD CONSTRAINT "BookingReservation_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "BookingSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingReservation" ADD CONSTRAINT "BookingReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Story" ADD CONSTRAINT "Story_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Story" ADD CONSTRAINT "Story_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Story" ADD CONSTRAINT "Story_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
