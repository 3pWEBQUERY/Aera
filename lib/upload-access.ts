import "server-only";
import prisma, { setTenantContext } from "./prisma";
import { activeRoleAtLeast } from "./tenant";
import type { User } from "@/app/generated/prisma/client";

/** Resolve an active tenant and enforce the purpose-specific staff boundary. */
export async function authorizeUpload(user: User, slug: string, purpose: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug, status: "ACTIVE" },
  });
  if (!tenant) return null;
  setTenantContext(tenant.id);
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (!membership || membership.status !== "ACTIVE") return null;
  if (purpose !== "avatar" && !activeRoleAtLeast(membership, "ADMIN")) return null;
  return { tenant, membership };
}
