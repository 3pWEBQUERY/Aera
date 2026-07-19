import "server-only";
import prisma, { systemPrisma } from "./prisma";
import { env } from "./env";
import type { Membership, Role, Tenant } from "@/app/generated/prisma/client";

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
}

export async function getTenantByDomain(domain: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({
    where: { customDomain: domain, status: "ACTIVE" },
  });
}

/**
 * Resolve the active tenant slug from an incoming host header.
 * Supports `slug.aera.so` subdomains and custom domains. The community
 * pages also accept a path-based `/c/{slug}` form for local development.
 */
export function slugFromHost(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0];
  const root = env.ROOT_DOMAIN;
  if (hostname === root || hostname === `www.${root}` || hostname === "localhost") {
    return null;
  }
  if (hostname.endsWith(`.${root}`)) {
    const sub = hostname.slice(0, -1 * (root.length + 1));
    if (sub && sub !== "www" && sub !== "app") return sub;
  }
  return null;
}

/**
 * Community header image (hero cover). Stored as the newest StorageObject
 * with purpose "community-cover" — no Tenant column needed. Managed from
 * Dashboard → Einstellungen → Branding.
 */
export async function getCommunityCoverUrl(tenantId: string): Promise<string | null> {
  const obj = await prisma.storageObject.findFirst({
    where: { tenantId, purpose: "community-cover" },
    orderBy: { createdAt: "desc" },
    select: { url: true },
  });
  return obj?.url ?? null;
}

export async function getMembership(
  tenantId: string,
  userId: string,
): Promise<Membership | null> {
  return prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });
}

const RANK: Record<Role, number> = {
  MEMBER: 0,
  MODERATOR: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/** Roles never grant tenant capabilities while the membership is inactive. */
export function activeRoleAtLeast(
  membership: Pick<Membership, "role" | "status"> | null | undefined,
  min: Role,
): boolean {
  return Boolean(
    membership?.status === "ACTIVE" && roleAtLeast(membership.role, min),
  );
}

export async function userTenants(userId: string): Promise<Tenant[]> {
  // Dashboard navigation intentionally spans tenants, so it must not inherit
  // the currently selected tenant's RLS context. The userId + ACTIVE filters
  // are the explicit privileged boundary.
  const memberships = await systemPrisma.membership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
      tenant: { status: "ACTIVE" },
    },
    include: { tenant: true },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => m.tenant);
}
