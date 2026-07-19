CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegalAcceptance_userId_document_version_key"
ON "LegalAcceptance"("userId", "document", "version");

CREATE INDEX "LegalAcceptance_document_version_acceptedAt_idx"
ON "LegalAcceptance"("document", "version", "acceptedAt");

ALTER TABLE "LegalAcceptance"
ADD CONSTRAINT "LegalAcceptance_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order"
ADD COLUMN "immediatePerformanceConsentedAt" TIMESTAMP(3),
ADD COLUMN "withdrawalLossAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN "legalTermsVersion" TEXT;

ALTER TABLE "Subscription"
ADD COLUMN "immediatePerformanceConsentedAt" TIMESTAMP(3),
ADD COLUMN "withdrawalLossAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN "legalTermsVersion" TEXT;
