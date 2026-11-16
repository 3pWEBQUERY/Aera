-- Tenant code may read the public profile columns of users who belong to
-- the tenant OR whose rows the tenant still holds.
--
-- The original policy (20260719110000_rls_least_privilege) only admitted users
-- with a current Membership row. Leaving a community and removal by an admin
-- delete that row, while the person's posts, comments, chat messages, orders,
-- tips, ... stay. Once tenant queries really ran under RLS, every relation to
-- such an author resolved to NULL and the community feed crashed. A user that
-- a tenant row references is not a stranger to that tenant: the row already
-- carries the id and the name is shown next to the content.
--
-- What stays locked: users the tenant has no row for (no enumeration of the
-- platform's users) and every column outside the existing column grants
-- (passwordHash, TOTP, platform role, account status, ...). No UPDATE policy
-- change: aera_app still cannot update any User column.
--
-- One EXISTS per tenant table with a foreign key to "User", Membership first
-- so current members short-circuit on the unique (tenantId, userId) index.
-- PromoCodeRedemption is privileged-only (no SELECT for aera_app) and is
-- deliberately not consulted. tests/rls-hardening.test.ts derives the list
-- from prisma/schema.prisma and fails when a new reference is missing here.
DROP POLICY IF EXISTS tenant_member_users_select ON public."User";
CREATE POLICY tenant_member_users_select ON public."User"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public."Membership" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."Post" AS ref
      WHERE ref."authorId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."Comment" AS ref
      WHERE ref."authorId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."Reaction" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."ChatMessage" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."LiveChatMessage" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."ConversationMember" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."Order" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."Subscription" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."Tip" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."AssistantConversation" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."AutomationDelivery" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."BadgeAward" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."BookingReservation" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."ContentPlan" AS ref
      WHERE ref."createdById" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."EmailEvent" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."EmailSuppression" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."Entitlement" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."EventRsvp" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."LessonProgress" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."MemberRequest" AS ref
      WHERE ref."requesterId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."MemberStats" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."NewsletterCampaign" AS ref
      WHERE ref."createdById" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."NewsletterConsent" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."NewsletterConsentEvent" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."NewsletterDelivery" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."Notification" AS ref
      WHERE ref."actorId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."Notification" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."PendingCreatorCheckout" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."PointsLedger" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."PollVote" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."Recommendation" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."RequestVote" AS ref
      WHERE ref."userId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."StorageObject" AS ref
      WHERE ref."ownerId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."StorageUploadReservation" AS ref
      WHERE ref."ownerId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
    OR EXISTS (
      SELECT 1 FROM public."Story" AS ref
      WHERE ref."authorId" = "User"."id"
        AND ref."tenantId" = current_setting('aera.tenant_id', true)
    )
  );
