-- Aeli: Rechtetrennung von Aera vorbereiten
--
-- Bisher lief Aeli fuer alles, was die Rolle `aeli_app` nicht darf, ueber die
-- Eigentuemer-Verbindung von Aera (`systemPrisma`). Wer Aeli uebernimmt,
-- haette damit die ganze Datenbank in der Hand gehabt — jede Community, jedes
-- Passwort-Hash, jedes Auszahlungskonto.
--
-- Diese Migration ersetzt diese Pfade durch eng geschnittene
-- SECURITY-DEFINER-Funktionen. Jede beantwortet genau eine Frage oder fuehrt
-- genau einen Schreibvorgang aus und gibt nur die Spalten heraus, die Aeli
-- dafuer braucht. Ausfuehren darf sie ausschliesslich `aeli_app` — weder
-- PUBLIC noch `aera_app`. Damit kann Aeli spaeter mit einer eigenen
-- Login-Rolle (`aeli_login`, nur Mitglied von `aeli_app`) laufen; angelegt
-- wird sie ausserhalb der Migrationen, weil sie ein Passwort braucht
-- (aeli.so/scripts/create-login-role.sql).
--
-- Funktionen, die nur fuer den angemeldeten Creator gelten, lesen den Besitzer
-- aus dem GUC `aeli.user_id` — demselben, an dem die RLS-Policies haengen —
-- statt ihn als Parameter zu nehmen.
--
-- Dazu:
--   * `AeliHandleRedirect`: ein geaenderter Handle bleibt 90 Tage reserviert
--     und leitet auf den neuen weiter.
--   * `AeliAuthState`: ein eigener Sitzungszaehler fuer Aeli. Abmelden zaehlt
--     ihn hoch; `User.sessionVersion` bleibt Aera vorbehalten, sonst wuerde
--     ein Abmelden auf aeli.so auch jede Aera-Sitzung beenden.
--   * Alle Aeli-Policies gelten ausdruecklich nur fuer `aeli_app`.
--   * `aeli_owner_block` prueft beim Schreiben, dass die Karte zum Profil
--     gehoert.
--
-- Die Migration fasst ausschliesslich Aeli-Objekte an und ist idempotent:
-- jede Anweisung darf ein zweites Mal laufen, ohne etwas zu veraendern.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AeliHandleRedirect" (
    "handle" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AeliHandleRedirect_pkey" PRIMARY KEY ("handle")
);

CREATE INDEX IF NOT EXISTS "AeliHandleRedirect_profileId_idx" ON "AeliHandleRedirect"("profileId");
CREATE INDEX IF NOT EXISTS "AeliHandleRedirect_expiresAt_idx" ON "AeliHandleRedirect"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AeliHandleRedirect_profileId_fkey') THEN
    ALTER TABLE "AeliHandleRedirect"
      ADD CONSTRAINT "AeliHandleRedirect_profileId_fkey"
      FOREIGN KEY ("profileId") REFERENCES "AeliProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "AeliAuthState" (
    "userId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AeliAuthState_pkey" PRIMARY KEY ("userId")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AeliAuthState_userId_fkey') THEN
    ALTER TABLE "AeliAuthState"
      ADD CONSTRAINT "AeliAuthState_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "AeliHandleRedirect" ENABLE ROW LEVEL SECURITY;
-- Kein Grant und keine Policy: gelesen und geschrieben wird nur ueber
-- aeli_session_user / aeli_end_sessions.
ALTER TABLE "AeliAuthState" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AeliAuthState" FROM PUBLIC;

-- Reservierungen: der Besitzer sieht seine, die Oeffentlichkeit sieht die
-- noch gueltigen eines veroeffentlichten Profils (fuer die Weiterleitung).
-- Geschrieben wird nur ueber aeli_change_handle.
DROP POLICY IF EXISTS aeli_owner_handle_redirect ON "AeliHandleRedirect";
CREATE POLICY aeli_owner_handle_redirect ON "AeliHandleRedirect"
  FOR SELECT
  TO aeli_app
  USING (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliHandleRedirect"."profileId"
      AND p."userId" = current_setting('aeli.user_id', true)
  ));

DROP POLICY IF EXISTS aeli_public_handle_redirect ON "AeliHandleRedirect";
CREATE POLICY aeli_public_handle_redirect ON "AeliHandleRedirect"
  FOR SELECT
  TO aeli_app
  USING (
    "expiresAt" > CURRENT_TIMESTAMP
    AND EXISTS (
      SELECT 1 FROM "AeliProfile" p
      WHERE p."id" = "AeliHandleRedirect"."profileId" AND p."status" = 'PUBLISHED'
    )
  );

REVOKE ALL ON "AeliHandleRedirect" FROM PUBLIC;
GRANT SELECT ON "AeliHandleRedirect" TO aeli_app;

-- ---------------------------------------------------------------------------
-- Policies nur fuer aeli_app
-- ---------------------------------------------------------------------------
-- Die ersten Aeli-Migrationen haben ihre Policies ohne `TO` angelegt, also fuer
-- PUBLIC. Solange nur aeli_app Rechte auf den Tabellen hat, war das folgenlos —
-- ein spaeterer Grant an eine andere Rolle haette aber sofort die
-- Aeli-Sichtbarkeitsregeln geerbt. ALTER POLICY ... TO ist idempotent.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT p.policyname, p.tablename
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.policyname LIKE 'aeli\_%'
      AND p.tablename LIKE 'Aeli%'
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO aeli_app', rec.policyname, rec.tablename);
  END LOOP;
END
$$;

-- Ein Baustein darf nur auf einer Karte desselben Profils landen. Ohne diese
-- Bedingung koennte ein Besitzer einen Baustein in die Karte eines fremden
-- Profils haengen (die Karte ist fuer ihn nicht sichtbar, die ID aber
-- erratbar) — dort erschiene er dann.
DROP POLICY IF EXISTS aeli_owner_block ON "AeliBlock";
CREATE POLICY aeli_owner_block ON "AeliBlock"
  TO aeli_app
  USING (EXISTS (
    SELECT 1 FROM "AeliProfile" p
    WHERE p."id" = "AeliBlock"."profileId"
      AND p."userId" = current_setting('aeli.user_id', true)
  ))
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "AeliProfile" p
      WHERE p."id" = "AeliBlock"."profileId"
        AND p."userId" = current_setting('aeli.user_id', true)
    )
    AND EXISTS (
      SELECT 1 FROM "AeliCard" c
      WHERE c."id" = "AeliBlock"."cardId"
        AND c."profileId" = "AeliBlock"."profileId"
    )
  );

-- ---------------------------------------------------------------------------
-- Anmeldung
-- ---------------------------------------------------------------------------

-- Genau die Felder, die eine Passwort- und Zwei-Faktor-Pruefung braucht.
CREATE OR REPLACE FUNCTION public.aeli_auth_lookup(p_email TEXT)
RETURNS TABLE (
  "id" TEXT,
  "passwordHash" TEXT,
  "totpSecret" TEXT,
  "totpEnabledAt" TIMESTAMP(3),
  "sessionVersion" INTEGER,
  "aeliSessionVersion" INTEGER,
  "accountStatus" TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u."id", u."passwordHash", u."totpSecret", u."totpEnabledAt", u."sessionVersion",
         COALESCE(s."sessionVersion", 0), u."accountStatus"::text
  FROM public."User" u
  LEFT JOIN public."AeliAuthState" s ON s."userId" = u."id"
  WHERE u."email" = lower(btrim(p_email))
  LIMIT 1
$$;

-- Der angemeldete Nutzer, wie das Studio ihn anzeigt. Kein Passwort-Hash,
-- kein TOTP-Geheimnis.
CREATE OR REPLACE FUNCTION public.aeli_session_user(p_user_id TEXT)
RETURNS TABLE (
  "id" TEXT,
  "email" TEXT,
  "name" TEXT,
  "avatarUrl" TEXT,
  "sessionVersion" INTEGER,
  "aeliSessionVersion" INTEGER,
  "accountStatus" TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u."id", u."email", u."name", u."avatarUrl", u."sessionVersion",
         COALESCE(s."sessionVersion", 0), u."accountStatus"::text
  FROM public."User" u
  LEFT JOIN public."AeliAuthState" s ON s."userId" = u."id"
  WHERE u."id" = p_user_id
  LIMIT 1
$$;

-- Registrierung: legt das Konto samt Zustimmungsnachweis an. Eine schon
-- vergebene Adresse liefert keine Zeile (statt eines Fehlers, der die
-- Transaktion des Aufrufers abbricht).
CREATE OR REPLACE FUNCTION public.aeli_register_user(
  p_id TEXT,
  p_email TEXT,
  p_name TEXT,
  p_password_hash TEXT,
  p_terms_version TEXT,
  p_privacy_version TEXT
)
RETURNS TABLE ("id" TEXT, "sessionVersion" INTEGER)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  v_id TEXT;
  v_version INTEGER;
BEGIN
  IF p_id IS NULL OR length(p_id) < 16 OR length(p_id) > 40 THEN
    RAISE EXCEPTION 'aeli_register_user: invalid id';
  END IF;
  IF p_email IS NULL OR p_email <> lower(btrim(p_email)) OR length(p_email) > 320
     OR position('@' IN p_email) < 2 THEN
    RAISE EXCEPTION 'aeli_register_user: invalid email';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) < 1 OR length(p_name) > 120 THEN
    RAISE EXCEPTION 'aeli_register_user: invalid name';
  END IF;
  -- Nur bcrypt mit Kostenfaktor 12, wie in Aera.
  IF p_password_hash IS NULL OR p_password_hash !~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$' THEN
    RAISE EXCEPTION 'aeli_register_user: invalid password hash';
  END IF;

  INSERT INTO public."User" ("id", "email", "name", "passwordHash", "updatedAt")
  VALUES (p_id, p_email, btrim(p_name), p_password_hash, CURRENT_TIMESTAMP)
  ON CONFLICT ("email") DO NOTHING
  RETURNING public."User"."id", public."User"."sessionVersion" INTO v_id, v_version;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public."LegalAcceptance" ("id", "userId", "document", "version", "source")
  VALUES
    (gen_random_uuid()::text, v_id, 'TERMS', p_terms_version, 'AELI_SIGNUP'),
    (gen_random_uuid()::text, v_id, 'PRIVACY_NOTICE', p_privacy_version, 'AELI_SIGNUP')
  ON CONFLICT DO NOTHING;

  "id" := v_id;
  "sessionVersion" := v_version;
  RETURN NEXT;
END;
$$;

-- Abmelden: entwertet alle Aeli-Sitzungen dieses Kontos. Nur wer die aktuelle
-- Version kennt (also ein gueltiges Token hat), zaehlt hoch.
CREATE OR REPLACE FUNCTION public.aeli_end_sessions(p_user_id TEXT, p_aeli_session_version INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_aeli_session_version IS NULL OR p_aeli_session_version < 0 THEN
    RETURN FALSE;
  END IF;
  IF p_aeli_session_version = 0 THEN
    -- Noch nie abgemeldet: es gibt keine Zeile, oder eine mit Version 0.
    INSERT INTO public."AeliAuthState" AS s ("userId", "sessionVersion", "updatedAt")
    SELECT u."id", 1, CURRENT_TIMESTAMP FROM public."User" u WHERE u."id" = p_user_id
    ON CONFLICT ("userId") DO UPDATE
      SET "sessionVersion" = s."sessionVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE s."sessionVersion" = 0;
  ELSE
    UPDATE public."AeliAuthState"
    SET "sessionVersion" = "sessionVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = p_user_id AND "sessionVersion" = p_aeli_session_version;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- Wiederherstellungscode verbrauchen (Hash wie in Aeras lib/totp-recovery.ts).
-- Bedingtes Update: zwei gleichzeitige Anmeldungen koennen denselben Code nicht
-- beide einloesen. Liefert die Zahl der noch freien Codes, -1 bei Misserfolg,
-- und schreibt denselben Audit-Eintrag wie Aera.
CREATE OR REPLACE FUNCTION public.aeli_consume_totp_recovery_code(p_user_id TEXT, p_code_hash TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_code_id TEXT;
BEGIN
  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN -1;
  END IF;

  UPDATE public."TotpRecoveryCode" c
  SET "usedAt" = CURRENT_TIMESTAMP
  FROM public."User" u
  WHERE c."userId" = p_user_id
    AND c."codeHash" = p_code_hash
    AND c."usedAt" IS NULL
    AND u."id" = c."userId"
    AND u."totpEnabledAt" IS NOT NULL
    AND u."accountStatus" = 'ACTIVE'
  RETURNING c."id" INTO v_code_id;

  IF v_code_id IS NULL THEN
    RETURN -1;
  END IF;

  INSERT INTO public."AuditLog" ("id", "tenantId", "actorUserId", "action", "metadata", "createdAt")
  VALUES (gen_random_uuid()::text, NULL, p_user_id, 'user.totp.recovery_code_used',
          '{"app":"aeli"}'::jsonb, CURRENT_TIMESTAMP);

  RETURN (
    SELECT count(*)::integer FROM public."TotpRecoveryCode"
    WHERE "userId" = p_user_id AND "usedAt" IS NULL
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Handles
-- ---------------------------------------------------------------------------

-- Ja/Nein, auch fuer fremde Entwuerfe und reservierte alte Handles.
CREATE OR REPLACE FUNCTION public.aeli_handle_taken(p_handle TEXT, p_own_profile_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."AeliProfile" p
    WHERE p."handle" = lower(btrim(p_handle)) AND p."id" IS DISTINCT FROM p_own_profile_id
  ) OR EXISTS (
    SELECT 1 FROM public."AeliHandleRedirect" r
    WHERE r."handle" = lower(btrim(p_handle))
      AND r."expiresAt" > CURRENT_TIMESTAMP
      AND r."profileId" IS DISTINCT FROM p_own_profile_id
  )
$$;

-- Welche der Kandidaten sind frei? Hoechstens 50 auf einmal.
CREATE OR REPLACE FUNCTION public.aeli_free_handles(p_candidates TEXT[])
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c.handle
  FROM unnest(p_candidates[1:50]) WITH ORDINALITY AS c(handle, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public."AeliProfile" p WHERE p."handle" = c.handle)
    AND NOT EXISTS (
      SELECT 1 FROM public."AeliHandleRedirect" r
      WHERE r."handle" = c.handle AND r."expiresAt" > CURRENT_TIMESTAMP
    )
  ORDER BY c.ord
$$;

-- Handle wechseln, atomar: neuen pruefen und setzen, den alten 90 Tage
-- reservieren, eine eigene Reservierung auf den neuen aufheben.
-- Ergebnis: 'ok' | 'unchanged' | 'taken' | 'invalid' | 'no-profile'.
CREATE OR REPLACE FUNCTION public.aeli_change_handle(p_new_handle TEXT)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user TEXT := NULLIF(current_setting('aeli.user_id', true), '');
  v_profile_id TEXT;
  v_old TEXT;
  v_new TEXT := lower(btrim(p_new_handle));
BEGIN
  IF v_user IS NULL THEN
    RETURN 'no-profile';
  END IF;
  IF v_new !~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' THEN
    RETURN 'invalid';
  END IF;

  SELECT p."id", p."handle" INTO v_profile_id, v_old
  FROM public."AeliProfile" p
  WHERE p."userId" = v_user
  FOR UPDATE;
  IF v_profile_id IS NULL THEN
    RETURN 'no-profile';
  END IF;
  IF v_old = v_new THEN
    RETURN 'unchanged';
  END IF;

  DELETE FROM public."AeliHandleRedirect" WHERE "expiresAt" <= CURRENT_TIMESTAMP;

  IF public.aeli_handle_taken(v_new, v_profile_id) THEN
    RETURN 'taken';
  END IF;

  BEGIN
    UPDATE public."AeliProfile"
    SET "handle" = v_new, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = v_profile_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN 'taken';
  END;

  DELETE FROM public."AeliHandleRedirect"
  WHERE "handle" = v_new AND "profileId" = v_profile_id;

  INSERT INTO public."AeliHandleRedirect" ("handle", "profileId", "expiresAt")
  VALUES (v_old, v_profile_id, CURRENT_TIMESTAMP + INTERVAL '90 days')
  ON CONFLICT ("handle") DO UPDATE
    SET "profileId" = EXCLUDED."profileId",
        "expiresAt" = EXCLUDED."expiresAt",
        "createdAt" = CURRENT_TIMESTAMP;

  RETURN 'ok';
END;
$$;

-- ---------------------------------------------------------------------------
-- Community-Bruecke
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.aeli_tenant_is_live(p_tenant_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."LiveSession" l
    JOIN public."Tenant" t ON t."id" = l."tenantId"
    WHERE l."tenantId" = p_tenant_id AND l."status" = 'LIVE' AND t."status" = 'ACTIVE'
  )
$$;

-- Die aktiven Communities des angemeldeten Creators: ID und Name.
CREATE OR REPLACE FUNCTION public.aeli_owned_tenants()
RETURNS TABLE ("id" TEXT, "name" TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT t."id", t."name"
  FROM public."Tenant" t
  WHERE t."ownerId" = NULLIF(current_setting('aeli.user_id', true), '')
    AND t."status" = 'ACTIVE'
  ORDER BY t."name"
$$;

-- ---------------------------------------------------------------------------
-- Auszahlungskonto
-- ---------------------------------------------------------------------------

-- Wohin Trinkgelder fuer dieses Profil gehen (Logik wie aeli.so/lib/payouts.ts):
-- eigenes Aeli-Konto, sonst das der verknuepften Community — nur wenn sie
-- demselben Konto gehoert. Das Profil muss veroeffentlicht sein oder dem
-- angemeldeten Creator gehoeren.
CREATE OR REPLACE FUNCTION public.aeli_profile_payout(p_profile_id TEXT)
RETURNS TABLE ("stripeAccountId" TEXT, "source" TEXT, "communityName" TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH profile AS (
    SELECT p."userId", p."linkedTenantId"
    FROM public."AeliProfile" p
    WHERE p."id" = p_profile_id
      AND (p."status" = 'PUBLISHED'
           OR p."userId" = NULLIF(current_setting('aeli.user_id', true), ''))
  )
  SELECT candidates."stripeAccountId", candidates."source", candidates."communityName"
  FROM (
    SELECT a."stripeAccountId", 'aeli'::text AS "source", NULL::text AS "communityName", 1 AS rank
    FROM profile pr JOIN public."AeliPayoutAccount" a ON a."userId" = pr."userId"
    UNION ALL
    SELECT t."stripeAccountId", 'aera'::text, t."name", 2
    FROM profile pr
    JOIN public."Tenant" t
      ON t."id" = pr."linkedTenantId"
     AND t."ownerId" = pr."userId"
     AND t."status" = 'ACTIVE'
     AND t."stripeAccountId" IS NOT NULL
  ) candidates
  ORDER BY candidates.rank
  LIMIT 1
$$;

-- Fuer die Einstellungen: gehoert die verknuepfte Community dir, hat sie Stripe?
CREATE OR REPLACE FUNCTION public.aeli_linked_community_payout()
RETURNS TABLE ("name" TEXT, "ownedByYou" BOOLEAN, "hasStripe" BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT t."name", t."ownerId" = p."userId", t."stripeAccountId" IS NOT NULL
  FROM public."AeliProfile" p
  JOIN public."Tenant" t ON t."id" = p."linkedTenantId"
  WHERE p."userId" = NULLIF(current_setting('aeli.user_id', true), '')
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.aeli_connect_payout_account(p_id TEXT, p_stripe_account_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user TEXT := NULLIF(current_setting('aeli.user_id', true), '');
  v_count INTEGER;
BEGIN
  IF v_user IS NULL OR p_stripe_account_id !~ '^acct_[A-Za-z0-9]{6,64}$' THEN
    RETURN FALSE;
  END IF;
  INSERT INTO public."AeliPayoutAccount" ("id", "userId", "stripeAccountId", "updatedAt")
  VALUES (p_id, v_user, p_stripe_account_id, CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.aeli_disconnect_payout_account()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user TEXT := NULLIF(current_setting('aeli.user_id', true), '');
  v_count INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RETURN 0;
  END IF;
  DELETE FROM public."AeliPayoutAccount" WHERE "userId" = v_user;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trinkgeld
-- ---------------------------------------------------------------------------

-- Legt eine ausstehende Zahlung an und bestimmt das Ziel SELBST (nicht der
-- Aufrufer). Liefert die Ziel-Kontokennung oder NULL.
CREATE OR REPLACE FUNCTION public.aeli_create_tip(
  p_id TEXT,
  p_profile_id TEXT,
  p_block_id TEXT,
  p_amount_cents INTEGER,
  p_message TEXT,
  p_fee_cents INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_destination TEXT;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents < 100 OR p_amount_cents > 50000
     OR p_fee_cents IS NULL OR p_fee_cents < 0 OR p_fee_cents > p_amount_cents THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."AeliBlock" b
    JOIN public."AeliProfile" p ON p."id" = b."profileId"
    JOIN public."AeliCard" c ON c."id" = b."cardId"
    WHERE b."id" = p_block_id AND p."id" = p_profile_id
      AND b."type" = 'TIP' AND b."isVisible" = TRUE AND c."isVisible" = TRUE
      AND p."status" = 'PUBLISHED'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT "stripeAccountId" INTO v_destination FROM public.aeli_profile_payout(p_profile_id);
  IF v_destination IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public."AeliTip" (
    "id", "profileId", "blockId", "amountCents", "currency", "message",
    "destinationAccountId", "platformFeeCents", "status"
  ) VALUES (
    p_id, p_profile_id, p_block_id, p_amount_cents, 'eur', left(NULLIF(btrim(p_message), ''), 280),
    v_destination, p_fee_cents, 'PENDING'
  );

  RETURN v_destination;
END;
$$;

-- Eine Zahlung ohne Checkout-Session wieder entfernen (Stripe nicht erreichbar).
CREATE OR REPLACE FUNCTION public.aeli_discard_tip(p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public."AeliTip"
  WHERE "id" = p_id AND "status" = 'PENDING' AND "stripeSessionId" IS NULL
    AND "createdAt" > CURRENT_TIMESTAMP - INTERVAL '1 hour';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- Webhook: bezahlt. Nur aus PENDING.
CREATE OR REPLACE FUNCTION public.aeli_mark_tip_paid(
  p_id TEXT,
  p_session_id TEXT,
  p_payment_intent_id TEXT,
  p_supporter_email TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public."AeliTip"
  SET "status" = 'PAID',
      "paidAt" = CURRENT_TIMESTAMP,
      "stripeSessionId" = p_session_id,
      "stripePaymentIntentId" = p_payment_intent_id,
      "supporterEmail" = left(p_supporter_email, 320)
  WHERE "id" = p_id AND "status" = 'PENDING';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Webhook: vollstaendig erstattet. Nur aus PAID.
CREATE OR REPLACE FUNCTION public.aeli_mark_tip_refunded(p_payment_intent_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public."AeliTip"
  SET "status" = 'REFUNDED'
  WHERE "stripePaymentIntentId" = p_payment_intent_id AND "status" = 'PAID';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Oeffentliche Seite
-- ---------------------------------------------------------------------------

-- Klickzaehler: derselbe Block, dasselbe Profil, veroeffentlicht und sichtbar.
CREATE OR REPLACE FUNCTION public.aeli_count_click(p_block_id TEXT, p_profile_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public."AeliBlock" b
  SET "clickCount" = b."clickCount" + 1
  FROM public."AeliProfile" p
  WHERE b."id" = p_block_id
    AND p."id" = b."profileId"
    AND p."id" = p_profile_id
    AND p."status" = 'PUBLISHED'
    AND b."isVisible" = TRUE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Einsendung aus einem Newsletter-, Kontakt- oder E-Mail-Gate-Formular.
-- Prueft, dass das Formular wirklich auf dieser Seite steht, schluckt doppelte
-- Eintragungen still und legt sonst den Lead an.
-- Ergebnis: 'created' | 'duplicate' | 'rejected'.
CREATE OR REPLACE FUNCTION public.aeli_submit_lead(
  p_id TEXT,
  p_profile_id TEXT,
  p_block_id TEXT,
  p_source TEXT,
  p_email TEXT,
  p_name TEXT,
  p_message TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email TEXT := lower(btrim(p_email));
BEGIN
  IF v_email IS NULL OR length(v_email) > 320 OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' THEN
    RETURN 'rejected';
  END IF;

  IF p_source = 'GATE' THEN
    IF p_block_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public."AeliProfile" p
      WHERE p."id" = p_profile_id AND p."status" = 'PUBLISHED' AND p."gate" = 'EMAIL'
    ) THEN
      RETURN 'rejected';
    END IF;
  ELSIF p_source IN ('NEWSLETTER', 'CONTACT') THEN
    IF p_block_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public."AeliBlock" b
      JOIN public."AeliProfile" p ON p."id" = b."profileId"
      JOIN public."AeliCard" c ON c."id" = b."cardId"
      WHERE b."id" = p_block_id
        AND p."id" = p_profile_id
        AND p."status" = 'PUBLISHED'
        AND b."type"::text = p_source
        AND b."isVisible" = TRUE
        AND c."isVisible" = TRUE
        AND (b."startsAt" IS NULL OR b."startsAt" <= CURRENT_TIMESTAMP)
        AND (b."endsAt" IS NULL OR b."endsAt" > CURRENT_TIMESTAMP)
    ) THEN
      RETURN 'rejected';
    END IF;
  ELSE
    RETURN 'rejected';
  END IF;

  -- Kontaktnachrichten sind ausgenommen: wer zweimal schreibt, hat zweimal
  -- etwas zu sagen.
  IF p_source <> 'CONTACT' AND EXISTS (
    SELECT 1 FROM public."AeliLead" l
    WHERE l."profileId" = p_profile_id AND l."email" = v_email AND l."source" = p_source
  ) THEN
    RETURN 'duplicate';
  END IF;

  INSERT INTO public."AeliLead" ("id", "profileId", "blockId", "source", "email", "name", "message")
  VALUES (
    p_id, p_profile_id, p_block_id, p_source, v_email,
    left(NULLIF(btrim(p_name), ''), 120),
    left(NULLIF(btrim(p_message), ''), 2000)
  );
  RETURN 'created';
END;
$$;

-- ---------------------------------------------------------------------------
-- Ausfuehrungsrechte: nur aeli_app
-- ---------------------------------------------------------------------------
-- Neue Funktionen sind in PostgreSQL fuer PUBLIC ausfuehrbar. Das wird hier
-- fuer jede Aeli-Funktion zurueckgenommen — sonst koennte auch aera_app sie
-- aufrufen und damit an Aeras eigenen Grants vorbei User-Daten lesen.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'aeli_auth_lookup', 'aeli_session_user', 'aeli_register_user', 'aeli_end_sessions',
        'aeli_consume_totp_recovery_code', 'aeli_handle_taken', 'aeli_free_handles',
        'aeli_change_handle', 'aeli_tenant_is_live', 'aeli_owned_tenants',
        'aeli_profile_payout', 'aeli_linked_community_payout', 'aeli_connect_payout_account',
        'aeli_disconnect_payout_account', 'aeli_create_tip', 'aeli_discard_tip',
        'aeli_mark_tip_paid', 'aeli_mark_tip_refunded', 'aeli_count_click', 'aeli_submit_lead'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.signature);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aera_app') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM aera_app', fn.signature);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO aeli_app', fn.signature);
  END LOOP;
END
$$;
