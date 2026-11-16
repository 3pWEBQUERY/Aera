import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import prisma, { systemPrisma, withTenantContext } from "./prisma";
import { getCurrentUser } from "./auth";
import { buildAccessContext, type AccessContext } from "./entitlements";
import { hasPlatformAdminAccess } from "./platform-admin";
import { roleAtLeast } from "./tenant";
import type { Role, Tenant, User } from "@/app/generated/prisma/client";

export async function requireUser(nextPath?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  }
  return user;
}

/**
 * Platform admin (/admin): durable DB role + verified e-mail + active TOTP.
 * A configured PLATFORM_ADMIN_EMAILS list is an optional additional barrier.
 * Everyone else gets a 404 so the area stays invisible.
 */
export const requirePlatformAdmin = cache(async (): Promise<User> => {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user)) {
    notFound();
  }
  return user;
});

export interface TenantAdminContext {
  user: User;
  tenant: Tenant;
  role: Role;
}

/**
 * Require the current user to be staff (>= ADMIN) of the tenant.
 * Request-deduped: layout + page share one lookup per request.
 *
 * This only AUTHORIZES. It cannot activate the RLS tenant context for the
 * caller (an AsyncLocalStorage store entered here would not survive the
 * caller's `await`), so tenant queries must run in an explicit scope:
 *
 *   const { tenant, user } = await requireTenantAdmin(slug);
 *   return withTenantContext(tenant.id, async () => { ... });
 */
export const requireTenantAdmin = cache(async function requireTenantAdmin(
  slug: string,
  minRole: Role = "ADMIN",
): Promise<TenantAdminContext> {
  const user = await requireUser(`/dashboard`);
  // Global slug lookup: the tenant is not known yet, so there is no scope.
  const tenant = await systemPrisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (!tenant) redirect("/dashboard");
  const membership = await withTenantContext(tenant.id, () =>
    prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    }),
  );
  if (
    !membership ||
    membership.status !== "ACTIVE" ||
    !roleAtLeast(membership.role, minRole)
  ) {
    redirect("/dashboard");
  }
  return { user, tenant, role: membership.role };
});

export interface CommunityContext {
  tenant: Tenant;
  user: User | null;
  ctx: AccessContext;
}

/**
 * Resolve tenant + access context for community pages (public or member).
 * Request-deduped: layout + page share one lookup per request.
 *
 * Like requireTenantAdmin this does not leave a tenant context behind; run
 * the caller's tenant queries in `withTenantContext(community.tenant.id, ...)`.
 */
export const getCommunityContext = cache(async function getCommunityContext(
  slug: string,
): Promise<CommunityContext | null> {
  // Resolve the global identity before entering the tenant-scoped RLS role.
  // getCurrentUser uses systemPrisma; keeping it outside the scope makes that
  // security boundary explicit, so protected User columns are never read as
  // aera_app.
  const user = await getCurrentUser();
  const tenant = await systemPrisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (!tenant) return null;
  const ctx = await withTenantContext(tenant.id, () =>
    buildAccessContext(tenant.id, user?.id ?? null),
  );
  return { tenant, user, ctx };
});
