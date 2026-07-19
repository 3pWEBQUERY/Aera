import type { Role } from "@/app/generated/prisma/client";

/**
 * Membership administration matrix. Owners are immutable. Tenant ADMINs may
 * manage members/moderators, but only an OWNER may create, change or remove an
 * ADMIN membership.
 */
export function canManageTenantMembership(
  actorRole: Role,
  targetRole: Role,
  requestedRole: Role = targetRole,
): boolean {
  if (targetRole === "OWNER" || requestedRole === "OWNER") return false;
  if (actorRole === "OWNER") return true;
  if (actorRole !== "ADMIN") return false;
  return targetRole !== "ADMIN" && requestedRole !== "ADMIN";
}
