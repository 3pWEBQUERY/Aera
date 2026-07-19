-- Bind paid booking capacity to the exact Stripe Checkout Session so an old
-- expiry/failure event cannot cancel a newer reservation payment.
ALTER TABLE "BookingReservation"
  ADD COLUMN "stripeSessionId" TEXT;

CREATE UNIQUE INDEX "BookingReservation_stripeSessionId_key"
  ON "BookingReservation"("stripeSessionId");

-- Refunded/charged-back tips must disappear from paid totals without deleting
-- their audit history.
ALTER TYPE "TipStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
