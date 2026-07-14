-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "address" TEXT,
ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'ONLINE',
ADD COLUMN     "location" TEXT,
ADD COLUMN     "startsAt" TIMESTAMP(3),
ADD COLUMN     "streamUrl" TEXT,
ADD COLUMN     "videoUrl" TEXT;
