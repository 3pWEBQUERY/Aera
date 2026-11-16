-- Apple-IAP-Refunds: Trinkgeld und Buchung kennen ihre bezahlende Transaktion,
-- damit reverseAppleOrder sie wie der Stripe-Pfad zurueckabwickeln kann.
-- Rein additiv, idempotent.
ALTER TABLE "Tip" ADD COLUMN IF NOT EXISTS "appleTransactionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Tip_appleTransactionId_key"
  ON "Tip" ("appleTransactionId");

ALTER TABLE "BookingReservation" ADD COLUMN IF NOT EXISTS "appleTransactionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "BookingReservation_appleTransactionId_key"
  ON "BookingReservation" ("appleTransactionId");
