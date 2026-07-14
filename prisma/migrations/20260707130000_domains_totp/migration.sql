-- Custom-Domain-Verifizierung
ALTER TABLE "Tenant" ADD COLUMN "customDomainVerifiedAt" TIMESTAMP(3);

-- Bestehende Custom Domains bleiben funktionsfähig (Grandfathering):
-- sie waren bereits in Betrieb, bevor die Verifizierung eingeführt wurde.
UPDATE "Tenant" SET "customDomainVerifiedAt" = CURRENT_TIMESTAMP
  WHERE "customDomain" IS NOT NULL;

-- Zwei-Faktor-Authentifizierung (TOTP)
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
