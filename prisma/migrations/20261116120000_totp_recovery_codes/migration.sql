-- Einmal-Wiederherstellungscodes für die Zwei-Faktor-Anmeldung.
--
-- Gespeichert wird nur ein SHA-256-Hash je Code (gesalzen mit der userId), nie
-- der Klartext. Die Tabelle gehört wie "User"."totpSecret" zur globalen
-- Identität und nicht zu einer Community: Login, Einrichtung und Verbrauch
-- laufen über den Besitzer-Zugang (systemPrisma). RLS ist trotzdem aktiv, aber
-- ohne Policy und ohne Grant an `aera_app` — die Tenant-Rolle sieht damit keine
-- einzige Zeile, auch wenn später versehentlich ein Grant dazukommt.

CREATE TABLE "TotpRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TotpRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TotpRecoveryCode_userId_codeHash_key" ON "TotpRecoveryCode"("userId", "codeHash");

CREATE INDEX "TotpRecoveryCode_userId_usedAt_idx" ON "TotpRecoveryCode"("userId", "usedAt");

ALTER TABLE "TotpRecoveryCode" ADD CONSTRAINT "TotpRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."TotpRecoveryCode" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."TotpRecoveryCode" FROM aera_app;
