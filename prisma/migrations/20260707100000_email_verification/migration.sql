-- E-Mail-Verifizierung: neues Feld am User.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Bestandskonten werden pauschal als verifiziert übernommen (Grandfathering):
-- sie sind vor Einführung der Verifizierung entstanden; ohne dieses Update
-- würden z. B. Newsletter an bestehende Mitglieder sofort ausbleiben.
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP;
