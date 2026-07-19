import "server-only";
import prisma from "./prisma";
import type {
  EntitlementSource,
  Membership,
  Role,
  Visibility,
} from "@/app/generated/prisma/client";
import { roleAtLeast } from "./tenant";

export interface AccessContext {
  userId: string | null;
  membership: Membership | null;
  role: Role | null;
  keys: Set<string>;
  isStaff: boolean; // moderator or above
  /** True only for entitlements that stem from actual payment (paid tier / purchase). */
  hasPaidEntitlement: boolean;
}

/** All currently valid entitlement keys for a user within a tenant. */
export async function entitlementKeys(
  tenantId: string,
  userId: string,
): Promise<Set<string>> {
  const now = new Date();
  const rows = await prisma.entitlement.findMany({
    where: {
      tenantId,
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { key: true },
  });
  return new Set(rows.map((r) => r.key));
}

export async function buildAccessContext(
  tenantId: string,
  userId: string | null,
): Promise<AccessContext> {
  if (!userId) {
    return {
      userId: null,
      membership: null,
      role: null,
      keys: new Set(),
      isStaff: false,
      hasPaidEntitlement: false,
    };
  }
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });
  const keys = await entitlementKeys(tenantId, userId);
  const role = membership?.role ?? null;
  const activeMembership = membership?.status === "ACTIVE";
  return {
    userId,
    membership,
    role,
    keys,
    isStaff: Boolean(activeMembership && role && roleAtLeast(role, "MODERATOR")),
    hasPaidEntitlement: await hasPaidKey(tenantId, keys),
  };
}

/**
 * True if any of the user's entitlement keys represents real paid access.
 * `product:`/`media:` keys only ever come from purchases; `tier:` keys also
 * exist for free default tiers, so those must be checked against the tier's
 * actual price — otherwise every free member would pass PAID gates.
 */
async function hasPaidKey(tenantId: string, keys: Set<string>): Promise<boolean> {
  if (keys.size === 0) return false;
  for (const k of keys) {
    if (
      k.startsWith("product:") ||
      k.startsWith("media:") ||
      k.startsWith("media-item:") ||
      k.startsWith("post:") ||
      k.startsWith("video:") ||
      k.startsWith("booking:") ||
      k.startsWith("request:")
    ) {
      return true;
    }
  }
  const tierKeys = [...keys].filter((k) => k.startsWith("tier:"));
  if (tierKeys.length === 0) return false;
  const paidTier = await prisma.membershipTier.findFirst({
    where: { tenantId, entitlementKey: { in: tierKeys }, priceCents: { gt: 0 } },
    select: { id: true },
  });
  return Boolean(paidTier);
}

export interface Gated {
  visibility: Visibility;
  requiredEntitlementKey: string | null;
}

/** Core paywall decision used by spaces, courses, events, products, media. */
export function canAccess(resource: Gated, ctx: AccessContext): boolean {
  // Staff always have access.
  if (ctx.isStaff) return true;

  const isActiveMember = ctx.membership?.status === "ACTIVE";

  if (resource.visibility === "PUBLIC" && !resource.requiredEntitlementKey) {
    return true;
  }
  // From here on, membership is required.
  if (!isActiveMember) return false;

  if (resource.requiredEntitlementKey) {
    return ctx.keys.has(resource.requiredEntitlementKey);
  }
  if (resource.visibility === "PAID") {
    // Only entitlements backed by actual payment unlock generic paid content.
    return ctx.hasPaidEntitlement;
  }
  // MEMBERS visibility, no specific key required.
  return true;
}

export async function grantEntitlement(input: {
  tenantId: string;
  userId: string;
  key: string;
  source: EntitlementSource;
  sourceId?: string;
  expiresAt?: Date | null;
}): Promise<void> {
  await prisma.entitlement.upsert({
    where: {
      tenantId_userId_key: {
        tenantId: input.tenantId,
        userId: input.userId,
        key: input.key,
      },
    },
    create: {
      tenantId: input.tenantId,
      userId: input.userId,
      key: input.key,
      source: input.source,
      sourceId: input.sourceId,
      expiresAt: input.expiresAt ?? null,
    },
    update: {
      source: input.source,
      sourceId: input.sourceId,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

export async function revokeEntitlement(
  tenantId: string,
  userId: string,
  key: string,
): Promise<void> {
  await prisma.entitlement
    .delete({
      where: { tenantId_userId_key: { tenantId, userId, key } },
    })
    .catch(() => undefined);
}

/**
 * When a member changes tier (downgrade or switch), the previous tier's
 * entitlement must be removed — otherwise the member keeps access to the old
 * (often higher or paid) tier's content. Only tier/role-derived grants are
 * touched; real purchases (`product:`/`media:`, source PURCHASE) always stay.
 * No-ops when the tier is unchanged, so it is safe on idempotent webhook retries.
 */
export async function revokePreviousTierEntitlement(input: {
  tenantId: string;
  userId: string;
  previousTierId: string | null | undefined;
  keepKey?: string | null;
}): Promise<void> {
  if (!input.previousTierId) return;
  const previousTier = await prisma.membershipTier.findFirst({
    where: { id: input.previousTierId, tenantId: input.tenantId },
    select: { entitlementKey: true },
  });
  if (!previousTier) return;
  if (input.keepKey && previousTier.entitlementKey === input.keepKey) return;
  await prisma.entitlement.deleteMany({
    where: {
      tenantId: input.tenantId,
      userId: input.userId,
      key: previousTier.entitlementKey,
      source: { in: ["TIER", "ROLE", "MANUAL"] },
    },
  });
}
