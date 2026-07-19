-- PostgreSQL RLS is enforced by switching tenant operations from the
-- privileged physical connection to this non-owner role in the same
-- transaction. Platform-wide paths deliberately stay on the table owner.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aera_app') THEN
    CREATE ROLE aera_app
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE aera_app
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

-- The role used by DATABASE_URL must be able to execute SET LOCAL ROLE. This
-- is idempotent and does not turn aera_app into a login role.
DO $$
BEGIN
  EXECUTE format('GRANT aera_app TO %I', session_user);
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM aera_app;
GRANT USAGE ON SCHEMA public TO aera_app;

-- Remove the old blanket/default grants. New tenant tables must explicitly
-- ship their policy and grant in a migration; an automatic grant would create
-- an isolation gap between deployment and a later repair script.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM aera_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM aera_app;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM aera_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM aera_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM aera_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM aera_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Every current table with a tenantId column receives the same isolation
-- policy, including nullable operational tables. A missing GUC yields NULL and
-- therefore never exposes nullable platform rows to the tenant role.
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'Membership',
    'MembershipTier',
    'Space',
    'MemberRequest',
    'RequestVote',
    'ContentPlan',
    'ContentPlanMedia',
    'BookingSlot',
    'BookingReservation',
    'Story',
    'Tip',
    'MediaPackage',
    'MediaItem',
    'Post',
    'Comment',
    'Reaction',
    'Course',
    'Lesson',
    'LessonProgress',
    'Event',
    'EventRsvp',
    'Product',
    'Order',
    'Subscription',
    'Entitlement',
    'NewsletterCampaign',
    'Segment',
    'EmailEvent',
    'NewsletterDelivery',
    'GamificationRule',
    'PointsLedger',
    'Badge',
    'BadgeAward',
    'Level',
    'MemberStats',
    'MediaFolder',
    'StorageObject',
    'AiContextChunk',
    'Recommendation',
    'LiveSession',
    'LiveChatMessage',
    'KnowledgeArticle',
    'AuditLog',
    'Conversation',
    'ConversationMember',
    'ChatMessage',
    'AssistantConversation',
    'AiCreditWallet',
    'PendingCreatorCheckout',
    'AiUsageEvent',
    'AiCreditPurchase',
    'AiCreditReservation',
    'StripeWebhookEvent',
    'Notification',
    'ApiKey',
    'WebhookEndpoint',
    'WebhookDelivery',
    'ModerationFlag',
    'AutomationStep',
    'AutomationDelivery',
    'ReferralConversion'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', v_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I '
      'USING ("tenantId" = current_setting(''aera.tenant_id'', true)) '
      'WITH CHECK ("tenantId" = current_setting(''aera.tenant_id'', true))',
      v_table
    );
  END LOOP;
END
$$;

ALTER TABLE public."Tenant" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON public."Tenant";
CREATE POLICY tenant_self ON public."Tenant"
  USING ("id" = current_setting('aera.tenant_id', true))
  WITH CHECK ("id" = current_setting('aera.tenant_id', true));

-- These child tables do not duplicate tenantId. Their policies follow the
-- tenant-owned parent instead of leaving an unscoped hole in the app role.
ALTER TABLE public."AssistantMessage" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_parent_isolation ON public."AssistantMessage";
CREATE POLICY tenant_parent_isolation ON public."AssistantMessage"
  USING (EXISTS (
    SELECT 1
    FROM public."AssistantConversation" AS conversation
    WHERE conversation."id" = "AssistantMessage"."conversationId"
      AND conversation."tenantId" = current_setting('aera.tenant_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public."AssistantConversation" AS conversation
    WHERE conversation."id" = "AssistantMessage"."conversationId"
      AND conversation."tenantId" = current_setting('aera.tenant_id', true)
  ));

ALTER TABLE public."PushSubscription" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_user_isolation ON public."PushSubscription";
CREATE POLICY tenant_user_isolation ON public."PushSubscription"
  USING (EXISTS (
    SELECT 1
    FROM public."Membership" AS membership
    WHERE membership."userId" = "PushSubscription"."userId"
      AND membership."tenantId" = current_setting('aera.tenant_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public."Membership" AS membership
    WHERE membership."userId" = "PushSubscription"."userId"
      AND membership."tenantId" = current_setting('aera.tenant_id', true)
  ));

-- Global identities stay on the privileged connection for login/invites.
-- Tenant code may only read/update users who actually belong to its tenant.
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_member_users_select ON public."User";
CREATE POLICY tenant_member_users_select ON public."User"
  FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM public."Membership" AS membership
    WHERE membership."userId" = "User"."id"
      AND membership."tenantId" = current_setting('aera.tenant_id', true)
  ));
DROP POLICY IF EXISTS tenant_member_users_update ON public."User";
CREATE POLICY tenant_member_users_update ON public."User"
  FOR UPDATE
  USING (EXISTS (
    SELECT 1
    FROM public."Membership" AS membership
    WHERE membership."userId" = "User"."id"
      AND membership."tenantId" = current_setting('aera.tenant_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public."Membership" AS membership
    WHERE membership."userId" = "User"."id"
      AND membership."tenantId" = current_setting('aera.tenant_id', true)
  ));

-- Tenant and ordinary tenant content need CRUD. Audit logs remain append-only
-- and StripeWebhookEvent remains a privileged-only cross-tenant inbox.
GRANT SELECT, DELETE ON TABLE public."Tenant" TO aera_app;
GRANT UPDATE (
  "name", "subdomain", "customDomain", "customDomainVerifiedAt", "tagline",
  "description", "logoUrl", "primaryColor", "accentColor", "category",
  "layout", "referralPercent", "stripeAccountId", "updatedAt"
) ON TABLE public."Tenant" TO aera_app;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'Membership',
    'MembershipTier',
    'Space',
    'MemberRequest',
    'RequestVote',
    'ContentPlan',
    'ContentPlanMedia',
    'BookingSlot',
    'BookingReservation',
    'Story',
    'Tip',
    'MediaPackage',
    'MediaItem',
    'Post',
    'Comment',
    'Reaction',
    'Course',
    'Lesson',
    'LessonProgress',
    'Event',
    'EventRsvp',
    'Product',
    'Order',
    'Subscription',
    'Entitlement',
    'NewsletterCampaign',
    'Segment',
    'EmailEvent',
    'NewsletterDelivery',
    'GamificationRule',
    'PointsLedger',
    'Badge',
    'BadgeAward',
    'Level',
    'MemberStats',
    'MediaFolder',
    'StorageObject',
    'AiContextChunk',
    'Recommendation',
    'LiveSession',
    'LiveChatMessage',
    'KnowledgeArticle',
    'Conversation',
    'ConversationMember',
    'ChatMessage',
    'AssistantConversation',
    'AiCreditWallet',
    'PendingCreatorCheckout',
    'AiUsageEvent',
    'AiCreditPurchase',
    'AiCreditReservation',
    'Notification',
    'ApiKey',
    'WebhookEndpoint',
    'WebhookDelivery',
    'ModerationFlag',
    'AutomationStep',
    'AutomationDelivery',
    'ReferralConversion'
  ]
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO aera_app',
      v_table
    );
  END LOOP;
END
$$;

GRANT SELECT ON TABLE public."AuditLog" TO aera_app;
GRANT SELECT (
  "id", "email", "name", "avatarUrl", "emailVerifiedAt", "createdAt", "updatedAt"
) ON TABLE public."User" TO aera_app;
GRANT UPDATE ("name", "avatarUrl", "updatedAt")
  ON TABLE public."User" TO aera_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."AssistantMessage" TO aera_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."PushSubscription" TO aera_app;

-- Recreate the append-only audit boundary with a fixed search path. The
-- definer (the migration/table owner) can insert tenantId NULL even while the
-- caller is aera_app and AuditLog RLS hides platform rows.
CREATE OR REPLACE FUNCTION public.aera_write_audit(
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
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public."AuditLog" (
    "id", "tenantId", "actorUserId", "action", "targetType", "targetId", "metadata", "createdAt"
  ) VALUES (
    p_id, p_tenant_id, p_actor_user_id, p_action, p_target_type, p_target_id,
    COALESCE(p_metadata, '{}'::jsonb), CURRENT_TIMESTAMP
  );
END;
$$;

-- Cross-tenant claim functions are callable only by their owner/privileged
-- platform connection. Granting them to aera_app would bypass tenant policies.
ALTER FUNCTION public.aera_claim_webhook_deliveries(INTEGER)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.aera_active_automation_steps()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.aera_claim_automation_deliveries(INTEGER)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.aera_claim_newsletter_deliveries(INTEGER)
  SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.aera_write_audit(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, aera_app;
GRANT EXECUTE ON FUNCTION public.aera_write_audit(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO aera_app;

-- Tenant-scoped atomic credit functions run inside withTenantTransaction.
-- They are invoker-rights functions, so RLS remains active under aera_app.
ALTER FUNCTION public.aera_reserve_ai_credit(TEXT, TEXT, TEXT, TEXT, TEXT)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.aera_settle_ai_credit(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.aera_release_ai_credit(TEXT, TEXT)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.aera_refund_ai_credit_purchase(TEXT, TEXT)
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.aera_reserve_ai_credit(TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, aera_app;
REVOKE ALL ON FUNCTION public.aera_settle_ai_credit(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, aera_app;
REVOKE ALL ON FUNCTION public.aera_release_ai_credit(TEXT, TEXT)
  FROM PUBLIC, aera_app;
REVOKE ALL ON FUNCTION public.aera_refund_ai_credit_purchase(TEXT, TEXT)
  FROM PUBLIC, aera_app;
GRANT EXECUTE ON FUNCTION public.aera_reserve_ai_credit(TEXT, TEXT, TEXT, TEXT, TEXT) TO aera_app;
GRANT EXECUTE ON FUNCTION public.aera_settle_ai_credit(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) TO aera_app;
GRANT EXECUTE ON FUNCTION public.aera_release_ai_credit(TEXT, TEXT) TO aera_app;
GRANT EXECUTE ON FUNCTION public.aera_refund_ai_credit_purchase(TEXT, TEXT) TO aera_app;

REVOKE ALL ON FUNCTION public.aera_claim_webhook_deliveries(INTEGER)
  FROM PUBLIC, aera_app;
REVOKE ALL ON FUNCTION public.aera_active_automation_steps()
  FROM PUBLIC, aera_app;
REVOKE ALL ON FUNCTION public.aera_claim_automation_deliveries(INTEGER)
  FROM PUBLIC, aera_app;
REVOKE ALL ON FUNCTION public.aera_claim_newsletter_deliveries(INTEGER)
  FROM PUBLIC, aera_app;
