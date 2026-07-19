import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import prisma, { setTenantContext } from "./prisma";
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
 */
export const requireTenantAdmin = cache(async function requireTenantAdmin(
  slug: string,
  minRole: Role = "ADMIN",
): Promise<TenantAdminContext> {
  const user = await requireUser(`/dashboard`);
  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (!tenant) redirect("/dashboard");
  setTenantContext(tenant.id);
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
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
 */
export const getCommunityContext = cache(async function getCommunityContext(
  slug: string,
): Promise<CommunityContext | null> {
  // Resolve the global identity before activating the tenant-scoped RLS role.
  // getCurrentUser currently uses systemPrisma, but keeping this ordering makes
  // that security boundary explicit and prevents future auth refactors from
  // accidentally reading protected User columns as aera_app.
  const user = await getCurrentUser();
  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (!tenant) return null;
  setTenantContext(tenant.id);
  const ctx = await buildAccessContext(tenant.id, user?.id ?? null);
  return { tenant, user, ctx };
});
