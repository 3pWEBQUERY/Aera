import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import prisma, { setTenantContext } from "./prisma";
import { getCurrentUser } from "./auth";
import { env } from "./env";
import { buildAccessContext, type AccessContext } from "./entitlements";
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
 * Platform admin (/admin): user must be logged in AND allowlisted via
 * PLATFORM_ADMIN_EMAILS. Everyone else gets a 404 — the area stays invisible.
 */
export const requirePlatformAdmin = cache(async (): Promise<User> => {
  const user = await getCurrentUser();
  if (!user || !env.PLATFORM_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
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
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) redirect("/dashboard");
  setTenantContext(tenant.id);
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (!membership || !roleAtLeast(membership.role, minRole)) {
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
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return null;
  setTenantContext(tenant.id);
  const user = await getCurrentUser();
  const ctx = await buildAccessContext(tenant.id, user?.id ?? null);
  return { tenant, user, ctx };
});
