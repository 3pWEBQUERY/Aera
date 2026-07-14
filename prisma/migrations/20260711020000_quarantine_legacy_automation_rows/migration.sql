-- Rows created by an older app process during the rolling-deploy window do
-- not contain immutable email snapshots and must never be sent.
UPDATE "AutomationDelivery"
SET "status" = 'EXHAUSTED',
    "error" = 'Legacy delivery is missing its immutable email snapshot',
    "leaseUntil" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('PENDING', 'RETRYING', 'PROCESSING')
  AND ("recipientEmail" = '' OR "subject" = '' OR "html" = '');

CREATE OR REPLACE FUNCTION aera_claim_automation_deliveries(p_limit INTEGER)
RETURNS TABLE(delivery_id TEXT, tenant_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE "AutomationDelivery"
  SET "status" = 'RETRYING', "leaseUntil" = NULL,
      "nextAttemptAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "status" = 'PROCESSING'
    AND "leaseUntil" IS NOT NULL
    AND "leaseUntil" <= CURRENT_TIMESTAMP
    AND "recipientEmail" <> '' AND "subject" <> '' AND "html" <> '';

  RETURN QUERY
  WITH candidates AS (
    SELECT d."id"
    FROM "AutomationDelivery" d
    WHERE d."status" IN ('PENDING', 'RETRYING')
      AND d."nextAttemptAt" <= CURRENT_TIMESTAMP
      AND d."recipientEmail" <> ''
      AND d."subject" <> ''
      AND d."html" <> ''
    ORDER BY d."nextAttemptAt" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
  )
  UPDATE "AutomationDelivery" d
  SET "status" = 'PROCESSING',
      "leaseUntil" = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
      "updatedAt" = CURRENT_TIMESTAMP
  FROM candidates c
  WHERE d."id" = c."id"
  RETURNING d."id", d."tenantId";
END;
$$;
