-- Aeli: Trinkgeld ueber Stripe
--
-- Zwei Tabellen, und beide sind enger geschnitten als die vier aus
-- 20260807120000_aeli_link_in_bio:
--
--   `AeliPayoutAccount` traegt die Stripe-Kontokennung des Creators. Sie
--   steht bewusst NICHT als Spalte auf `AeliProfile`: dessen oeffentliche
--   Policy gibt eine veroeffentlichte Zeile vollstaendig heraus, und
--   PostgreSQL kennt keine Policy je Spalte. Was hier steht, sieht nur der
--   Besitzer.
--
--   `AeliTip` ist die Zahlung. Auch sie ist ausschliesslich fuer den
--   Besitzer lesbar — ein Trinkgeld ist zwischen zwei Menschen, nicht
--   oeffentlich wie ein Klick.
--
-- Anders als bei Leads gibt es hier KEINEN oeffentlichen Schreibpfad. Eine
-- Zahlung anzulegen heisst, ein Auszahlungskonto zu bestimmen, und dafuer
-- braucht es `Tenant.ownerId` — eine Spalte, die `aeli_app` bewusst nicht
-- sieht. Der ganze Weg laeuft deshalb ueber die privilegierte Verbindung
-- (aeli.so/lib/payouts.ts, aeli.so/lib/tips.ts). Das ist keine Bequemlichkeit:
-- wer hier eine Zeile schreiben darf, bestimmt, wohin Geld fliesst.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
CREATE TYPE "AeliTipStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED');

CREATE TABLE "AeliPayoutAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeliPayoutAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AeliPayoutAccount_userId_key" ON "AeliPayoutAccount"("userId");
CREATE UNIQUE INDEX "AeliPayoutAccount_stripeAccountId_key" ON "AeliPayoutAccount"("stripeAccountId");

ALTER TABLE "AeliPayoutAccount"
  ADD CONSTRAINT "AeliPayoutAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AeliTip" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "blockId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "message" TEXT,
    "supporterEmail" TEXT,
    "status" "AeliTipStatus" NOT NULL DEFAULT 'PENDING',
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "destinationAccountId" TEXT NOT NULL,
    "platformFeeCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "AeliTip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AeliTip_stripeSessionId_key" ON "AeliTip"("stripeSessionId");
CREATE INDEX "AeliTip_profileId_createdAt_idx" ON "AeliTip"("profileId", "createdAt");
CREATE INDEX "AeliTip_profileId_status_idx" ON "AeliTip"("profileId", "status");

ALTER TABLE "AeliTip"
  ADD CONSTRAINT "AeliTip_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "AeliProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE "AeliPayoutAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AeliTip" ENABLE ROW LEVEL SECURITY;

-- Kein `FOR SELECT`: die Policy gilt fuer jeden Zugriff. `aeli_app` bekommt
-- unten ohnehin nur SELECT — dass die Policy weiter gefasst ist als das
-- Recht, schadet nicht und wuerde bei einem spaeteren GRANT nicht ploetzlich
-- eine Luecke aufreissen.
CREATE POLICY aeli_owner_payout ON "AeliPayoutAccount"
  USING ("userId" = current_setting('aeli.user_id', true))
  WITH CHECK ("userId" = current_setting('aeli.user_id', true));

CREATE POLICY aeli_owner_tip ON "AeliTip"
  USING (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliTip"."profileId"
      AND p."userId" = current_setting('aeli.user_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliTip"."profileId"
      AND p."userId" = current_setting('aeli.user_id', true)
  ));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Nur lesen. Angelegt und fortgeschrieben wird ueber die privilegierte
-- Verbindung — siehe Kopf dieser Datei.
GRANT SELECT ON "AeliPayoutAccount" TO aeli_app;
GRANT SELECT ON "AeliTip" TO aeli_app;
