-- Reserve limited product inventory before creating an external Checkout
-- Session. A partial unique index permits only one live product reservation
-- per member while allowing any number of completed/failed orders.

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "inventoryReservedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "inventoryReservationExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "inventoryReleasedAt" TIMESTAMP(3);

-- Legacy PENDING product orders were not stock reservations and have no
-- expiry. Close them before the partial uniqueness rule becomes active.
UPDATE "Order"
SET "status" = 'FAILED', "inventoryReleasedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING'
  AND "productId" IS NOT NULL
  AND "inventoryReservedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Order_tenantId_productId_userId_status_idx"
  ON "Order"("tenantId", "productId", "userId", "status");

CREATE INDEX IF NOT EXISTS "Order_status_inventoryReservationExpiresAt_idx"
  ON "Order"("status", "inventoryReservationExpiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Order_active_product_reservation_key"
  ON "Order"("tenantId", "userId", "productId")
  WHERE "status" = 'PENDING'
    AND "productId" IS NOT NULL
    AND "inventoryReleasedAt" IS NULL;
