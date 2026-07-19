-- Lifecycle state is privileged-only, but RLS remains enabled as a second
-- isolation boundary in case a future grant is added accidentally.
ALTER TABLE "ObjectDeletionTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorageReconciliationState" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "ObjectDeletionTask";
CREATE POLICY tenant_isolation ON "ObjectDeletionTask"
  USING (
    "tenantId" = NULLIF(current_setting('aera.tenant_id', true), '')
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('aera.tenant_id', true), '')
  );

DROP POLICY IF EXISTS tenant_isolation ON "StorageReconciliationState";
CREATE POLICY tenant_isolation ON "StorageReconciliationState"
  USING (
    "tenantId" = NULLIF(current_setting('aera.tenant_id', true), '')
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('aera.tenant_id', true), '')
  );

REVOKE ALL ON TABLE "ObjectDeletionTask" FROM PUBLIC, aera_app;
REVOKE ALL ON TABLE "StorageReconciliationState" FROM PUBLIC, aera_app;
