-- A Stripe event id protects the webhook inbox. The invoice id additionally
-- protects the business mutation if an event is retried after the wallet was
-- updated but before the inbox event could be marked completed.
ALTER TABLE "AiCreditWallet"
  ADD COLUMN "lastPaidStripeInvoiceId" TEXT;

CREATE UNIQUE INDEX "AiCreditWallet_lastPaidStripeInvoiceId_key"
  ON "AiCreditWallet"("lastPaidStripeInvoiceId");
