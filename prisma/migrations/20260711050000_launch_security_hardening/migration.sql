-- New automation rows must reference a real user. Existing legacy rows are
-- preserved; NOT VALID still enforces the constraint for every new write.
ALTER TABLE "AutomationDelivery"
  ADD CONSTRAINT "AutomationDelivery_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

-- Audit writes are append-only and may be tenant-scoped or platform-global.
-- The narrow SECURITY DEFINER function avoids granting RLS bypass to the app.
CREATE OR REPLACE FUNCTION aera_write_audit(
  p_id TEXT,
  p_tenant_id TEXT,
  p_actor_user_id TEXT,
  p_action TEXT,
  p_target_type TEXT,
  p_target_id TEXT,
  p_metadata JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO "AuditLog" (
    "id", "tenantId", "actorUserId", "action", "targetType", "targetId", "metadata", "createdAt"
  ) VALUES (
    p_id, p_tenant_id, p_actor_user_id, p_action, p_target_type, p_target_id,
    COALESCE(p_metadata, '{}'::jsonb), CURRENT_TIMESTAMP
  );
END;
$$;
