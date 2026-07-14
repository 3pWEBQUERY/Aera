-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "videoUrl" TEXT,
ALTER COLUMN "body" SET DEFAULT '';
