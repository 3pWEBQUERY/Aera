-- Keep lifecycle, money-routing and verification writes off the generic
-- tenant role. These operations run only after their OWNER/ADMIN guard through
-- the explicit privileged Prisma client.
REVOKE DELETE ON TABLE public."Tenant" FROM aera_app;
REVOKE UPDATE (
  "customDomainVerifiedAt", "referralPercent", "stripeAccountId"
) ON TABLE public."Tenant" FROM aera_app;

-- A tenant role must not update another member's global identity row. Profile
-- and staff avatar changes use narrowly scoped, guarded system-client calls.
REVOKE UPDATE ("name", "avatarUrl", "updatedAt")
  ON TABLE public."User" FROM aera_app;
DROP POLICY IF EXISTS tenant_member_users_update ON public."User";

-- Audit integrity is a platform boundary. Tenant SQL may read its own audit
-- history but cannot call the SECURITY DEFINER writer or forge platform rows.
REVOKE ALL ON FUNCTION public.aera_write_audit(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, aera_app;
