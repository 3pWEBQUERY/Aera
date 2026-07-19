-- Explicit, per-community newsletter consent. Existing memberships are not
-- backfilled: absence of a row therefore remains "no marketing opt-in".
CREATE TYPE "NewsletterConsentStatus" AS ENUM ('OPTED_IN', 'WITHDRAWN');
CREATE TYPE "NewsletterConsentEventType" AS ENUM ('OPTED_IN', 'WITHDRAWN');
CREATE TYPE "EmailSuppressionReason" AS ENUM ('UNSUBSCRIBED', 'BOUNCE', 'COMPLAINT', 'MANUAL');

ALTER TYPE "NewsletterDeliveryStatus" ADD VALUE 'SUPPRESSED' BEFORE 'EXHAUSTED';
ALTER TYPE "AutomationDeliveryStatus" ADD VALUE 'SUPPRESSED' BEFORE 'EXHAUSTED';
ALTER TYPE "EmailEventType" ADD VALUE 'COMPLAINED';
ALTER TYPE "EmailEventType" ADD VALUE 'SUPPRESSED';

ALTER TABLE "NewsletterDelivery" ADD COLUMN "unsubscribeUrl" TEXT;
ALTER TABLE "AutomationDelivery" ADD COLUMN "unsubscribeUrl" TEXT;

CREATE TABLE "NewsletterConsent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" "NewsletterConsentStatus" NOT NULL,
  "optedInAt" TIMESTAMP(3),
  "optedInSource" TEXT,
  "withdrawnAt" TIMESTAMP(3),
  "withdrawnSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NewsletterConsent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NewsletterConsent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NewsletterConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "NewsletterConsent_tenantId_userId_key" ON "NewsletterConsent"("tenantId", "userId");
CREATE INDEX "NewsletterConsent_tenantId_status_updatedAt_idx" ON "NewsletterConsent"("tenantId", "status", "updatedAt");
CREATE INDEX "NewsletterConsent_userId_idx" ON "NewsletterConsent"("userId");

CREATE TABLE "NewsletterConsentEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "consentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "type" "NewsletterConsentEventType" NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NewsletterConsentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NewsletterConsentEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NewsletterConsentEvent_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "NewsletterConsent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NewsletterConsentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "NewsletterConsentEvent_tenantId_userId_createdAt_idx" ON "NewsletterConsentEvent"("tenantId", "userId", "createdAt");
CREATE INDEX "NewsletterConsentEvent_consentId_createdAt_idx" ON "NewsletterConsentEvent"("consentId", "createdAt");

CREATE TABLE "EmailSuppression" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "reason" "EmailSuppressionReason" NOT NULL,
  "source" TEXT NOT NULL,
  "suppressedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "liftedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailSuppression_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmailSuppression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EmailSuppression_tenantId_email_reason_key" ON "EmailSuppression"("tenantId", "email", "reason");
CREATE INDEX "EmailSuppression_tenantId_email_liftedAt_idx" ON "EmailSuppression"("tenantId", "email", "liftedAt");
CREATE INDEX "EmailSuppression_userId_idx" ON "EmailSuppression"("userId");

-- Resend is a cross-tenant provider. Its signed, deduplicated inbox stays on
-- the explicit privileged connection and is never exposed to aera_app.
CREATE TABLE "EmailWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailWebhookEvent_providerMessageId_idx" ON "EmailWebhookEvent"("providerMessageId");
CREATE INDEX "EmailWebhookEvent_createdAt_idx" ON "EmailWebhookEvent"("createdAt");

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'NewsletterConsent',
    'NewsletterConsentEvent',
    'EmailSuppression'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I USING ("tenantId" = current_setting(''aera.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''aera.tenant_id'', true))',
      v_table
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, aera_app', v_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO aera_app', v_table);
  END LOOP;
END
$$;

REVOKE ALL ON TABLE "EmailWebhookEvent" FROM PUBLIC, aera_app;
