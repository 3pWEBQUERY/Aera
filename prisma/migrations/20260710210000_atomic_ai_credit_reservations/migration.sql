CREATE TYPE "AiCreditReservationStatus" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED');
CREATE TYPE "AiCreditSource" AS ENUM ('INCLUDED', 'PURCHASED');

CREATE TABLE "AiCreditReservation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "conversationId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'assistant_message',
  "source" "AiCreditSource" NOT NULL,
  "reservedCredits" INTEGER NOT NULL DEFAULT 1,
  "chargedCredits" INTEGER,
  "promptTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "status" "AiCreditReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiCreditReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCreditReservation_tenantId_status_expiresAt_idx"
  ON "AiCreditReservation"("tenantId", "status", "expiresAt");
CREATE INDEX "AiCreditReservation_tenantId_createdAt_idx"
  ON "AiCreditReservation"("tenantId", "createdAt");
ALTER TABLE "AiCreditReservation"
  ADD CONSTRAINT "AiCreditReservation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reserve exactly one credit before calling an external AI provider. Wallet
-- row locking serializes concurrent requests for the same tenant.
CREATE OR REPLACE FUNCTION aera_reserve_ai_credit(
  p_id TEXT,
  p_tenant_id TEXT,
  p_user_id TEXT,
  p_conversation_id TEXT,
  p_kind TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_included INTEGER;
  v_purchased INTEGER;
  v_source "AiCreditSource";
  expired RECORD;
BEGIN
  PERFORM set_config('aera.tenant_id', p_tenant_id, TRUE);

  -- Recover reservations left behind by a crashed request.
  FOR expired IN
    SELECT "id", "source", "reservedCredits"
    FROM "AiCreditReservation"
    WHERE "tenantId" = p_tenant_id
      AND "status" = 'RESERVED'
      AND "expiresAt" <= CURRENT_TIMESTAMP
    FOR UPDATE
  LOOP
    IF expired."source" = 'INCLUDED' THEN
      UPDATE "AiCreditWallet"
      SET "includedRemaining" = LEAST("monthlyCredits", "includedRemaining" + expired."reservedCredits"),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "tenantId" = p_tenant_id;
    ELSE
      UPDATE "AiCreditWallet"
      SET "purchasedRemaining" = "purchasedRemaining" + expired."reservedCredits",
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "tenantId" = p_tenant_id;
    END IF;
    UPDATE "AiCreditReservation"
    SET "status" = 'RELEASED', "settledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = expired."id";
  END LOOP;

  SELECT "includedRemaining", "purchasedRemaining"
  INTO v_included, v_purchased
  FROM "AiCreditWallet"
  WHERE "tenantId" = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR (v_included + v_purchased) <= 0 THEN
    RETURN FALSE;
  END IF;

  IF v_included > 0 THEN
    v_source := 'INCLUDED';
    UPDATE "AiCreditWallet"
    SET "includedRemaining" = "includedRemaining" - 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "tenantId" = p_tenant_id;
  ELSE
    v_source := 'PURCHASED';
    UPDATE "AiCreditWallet"
    SET "purchasedRemaining" = "purchasedRemaining" - 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "tenantId" = p_tenant_id;
  END IF;

  INSERT INTO "AiCreditReservation" (
    "id", "tenantId", "userId", "conversationId", "kind", "source",
    "reservedCredits", "status", "expiresAt", "updatedAt"
  ) VALUES (
    p_id, p_tenant_id, p_user_id, p_conversation_id, p_kind, v_source,
    1, 'RESERVED', CURRENT_TIMESTAMP + INTERVAL '15 minutes', CURRENT_TIMESTAMP
  );
  RETURN TRUE;
END;
$$;

-- Settle actual token use and create the usage ledger entry in the same
-- transaction. If the call costs more than the remaining balance, only the
-- available amount is charged and balances never become negative.
CREATE OR REPLACE FUNCTION aera_settle_ai_credit(
  p_reservation_id TEXT,
  p_tenant_id TEXT,
  p_usage_id TEXT,
  p_prompt_tokens INTEGER,
  p_output_tokens INTEGER,
  p_total_tokens INTEGER,
  p_requested_credits INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  reservation RECORD;
  v_included INTEGER;
  v_purchased INTEGER;
  v_additional INTEGER;
  v_from_included INTEGER;
  v_from_purchased INTEGER;
  v_charged INTEGER;
BEGIN
  PERFORM set_config('aera.tenant_id', p_tenant_id, TRUE);
  SELECT * INTO reservation
  FROM "AiCreditReservation"
  WHERE "id" = p_reservation_id AND "tenantId" = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 0; END IF;
  IF reservation."status" = 'SETTLED' THEN
    RETURN COALESCE(reservation."chargedCredits", 0);
  END IF;
  IF reservation."status" = 'RELEASED' THEN RETURN 0; END IF;

  SELECT "includedRemaining", "purchasedRemaining"
  INTO v_included, v_purchased
  FROM "AiCreditWallet"
  WHERE "tenantId" = p_tenant_id
  FOR UPDATE;

  v_additional := GREATEST(0, p_requested_credits - reservation."reservedCredits");
  v_from_included := LEAST(v_included, v_additional);
  v_from_purchased := LEAST(v_purchased, v_additional - v_from_included);
  v_charged := reservation."reservedCredits" + v_from_included + v_from_purchased;

  UPDATE "AiCreditWallet"
  SET "includedRemaining" = v_included - v_from_included,
      "purchasedRemaining" = v_purchased - v_from_purchased,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "tenantId" = p_tenant_id;

  INSERT INTO "AiUsageEvent" (
    "id", "tenantId", "userId", "conversationId", "kind",
    "promptTokens", "outputTokens", "totalTokens", "credits", "createdAt"
  ) VALUES (
    p_usage_id, p_tenant_id, reservation."userId", reservation."conversationId", reservation."kind",
    GREATEST(0, p_prompt_tokens), GREATEST(0, p_output_tokens), GREATEST(0, p_total_tokens),
    v_charged, CURRENT_TIMESTAMP
  );

  UPDATE "AiCreditReservation"
  SET "status" = 'SETTLED', "chargedCredits" = v_charged,
      "promptTokens" = GREATEST(0, p_prompt_tokens),
      "outputTokens" = GREATEST(0, p_output_tokens),
      "totalTokens" = GREATEST(0, p_total_tokens),
      "settledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_reservation_id;

  RETURN v_charged;
END;
$$;

-- Refund the one-credit lease when the external provider call fails.
CREATE OR REPLACE FUNCTION aera_release_ai_credit(
  p_reservation_id TEXT,
  p_tenant_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  reservation RECORD;
BEGIN
  PERFORM set_config('aera.tenant_id', p_tenant_id, TRUE);
  SELECT * INTO reservation
  FROM "AiCreditReservation"
  WHERE "id" = p_reservation_id AND "tenantId" = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR reservation."status" <> 'RESERVED' THEN RETURN FALSE; END IF;

  IF reservation."source" = 'INCLUDED' THEN
    UPDATE "AiCreditWallet"
    SET "includedRemaining" = LEAST("monthlyCredits", "includedRemaining" + reservation."reservedCredits"),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "tenantId" = p_tenant_id;
  ELSE
    UPDATE "AiCreditWallet"
    SET "purchasedRemaining" = "purchasedRemaining" + reservation."reservedCredits",
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "tenantId" = p_tenant_id;
  END IF;

  UPDATE "AiCreditReservation"
  SET "status" = 'RELEASED', "settledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_reservation_id;
  RETURN TRUE;
END;
$$;
