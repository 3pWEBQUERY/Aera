-- Apple In-App-Purchases (Mobile API):
--  * explizite StoreKit-Produkt-Zuordnung für Stufen & Produkte
--  * Idempotenz-Schlüssel für IAP-Bestellungen (transactionId) und
--    Auto-Renewable-Abos (originalTransactionId)

ALTER TABLE "MembershipTier" ADD COLUMN IF NOT EXISTS "appleProductId" TEXT;
ALTER TABLE "Product"        ADD COLUMN IF NOT EXISTS "appleProductId" TEXT;
ALTER TABLE "Order"          ADD COLUMN IF NOT EXISTS "appleTransactionId" TEXT;
ALTER TABLE "Subscription"   ADD COLUMN IF NOT EXISTS "appleOriginalTransactionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_appleTransactionId_key"
  ON "Order" ("appleTransactionId");
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_appleOriginalTransactionId_key"
  ON "Subscription" ("appleOriginalTransactionId");
