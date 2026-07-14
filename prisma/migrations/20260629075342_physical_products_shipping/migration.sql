-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE 'PHYSICAL';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fulfilled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shippingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shippingDetails" JSONB;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "freeShipping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresShipping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shippingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stock" INTEGER;
