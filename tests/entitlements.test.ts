import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    setTenantContext: vi.fn(),
    withTenantContext: (_: string, fn: () => unknown) => fn(),
  };
});

import prismaModule from "@/lib/prisma";
const prisma = prismaModule as unknown as PrismaMock;

import {
  canAccess,
  buildAccessContext,
  type AccessContext,
} from "@/lib/entitlements";

function ctx(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: "u1",
    membership: {
      id: "m1",
      tenantId: "t1",
      userId: "u1",
      role: "MEMBER",
      status: "ACTIVE",
      tierId: null,
      joinedAt: new Date(),
    } as AccessContext["membership"],
    role: "MEMBER",
    keys: new Set<string>(),
    isStaff: false,
    hasPaidEntitlement: false,
    ...overrides,
  };
}

const anonymous: AccessContext = {
  userId: null,
  membership: null,
  role: null,
  keys: new Set(),
  isStaff: false,
  hasPaidEntitlement: false,
};

describe("canAccess (paywall core)", () => {
  it("staff always have access, even to paid content", () => {
    const staff = ctx({ isStaff: true, role: "MODERATOR" });
    expect(canAccess({ visibility: "PAID", requiredEntitlementKey: "tier:vip" }, staff)).toBe(true);
  });

  it("PUBLIC without key is open to everyone, including logged-out visitors", () => {
    expect(canAccess({ visibility: "PUBLIC", requiredEntitlementKey: null }, anonymous)).toBe(true);
  });

  it("PUBLIC with a required key still demands active membership + key", () => {
    const gated = { visibility: "PUBLIC" as const, requiredEntitlementKey: "product:x" };
    expect(canAccess(gated, anonymous)).toBe(false);
    expect(canAccess(gated, ctx())).toBe(false);
    expect(canAccess(gated, ctx({ keys: new Set(["product:x"]) }))).toBe(true);
  });

  it("MEMBERS requires an ACTIVE membership", () => {
    const res = { visibility: "MEMBERS" as const, requiredEntitlementKey: null };
    expect(canAccess(res, ctx())).toBe(true);
    expect(canAccess(res, anonymous)).toBe(false);
    const pending = ctx();
    (pending.membership as { status: string }).status = "PENDING";
    expect(canAccess(res, pending)).toBe(false);
    const banned = ctx();
    (banned.membership as { status: string }).status = "BANNED";
    expect(canAccess(res, banned)).toBe(false);
  });

  it("PAID without a specific key requires a payment-backed entitlement", () => {
    const res = { visibility: "PAID" as const, requiredEntitlementKey: null };
    // Free members must NOT pass generic paid gates.
    expect(canAccess(res, ctx({ keys: new Set(["tier:free"]) }))).toBe(false);
    expect(canAccess(res, ctx({ hasPaidEntitlement: true }))).toBe(true);
  });

  it("a specific required key wins over generic paid status", () => {
    const res = { visibility: "PAID" as const, requiredEntitlementKey: "tier:vip" };
    // Paid elsewhere but missing this key -> no access.
    expect(canAccess(res, ctx({ hasPaidEntitlement: true }))).toBe(false);
    expect(canAccess(res, ctx({ keys: new Set(["tier:vip"]) }))).toBe(true);
  });
});

describe("buildAccessContext / hasPaidEntitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty context for logged-out users", async () => {
    const result = await buildAccessContext("t1", null);
    expect(result.userId).toBeNull();
    expect(result.keys.size).toBe(0);
    expect(result.isStaff).toBe(false);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it("free tier keys do not count as paid entitlements", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", status: "ACTIVE",
    });
    prisma.entitlement.findMany.mockResolvedValue([{ key: "tier:free" }]);
    // No paid tier row matches the key.
    prisma.membershipTier.findFirst.mockResolvedValue(null);

    const result = await buildAccessContext("t1", "u1");
    expect(result.hasPaidEntitlement).toBe(false);
    expect(prisma.membershipTier.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ priceCents: { gt: 0 } }),
      }),
    );
  });

  it("purchase-backed keys (product:/media:) count as paid without a DB check", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", status: "ACTIVE",
    });
    prisma.entitlement.findMany.mockResolvedValue([{ key: "product:ebook" }]);

    const result = await buildAccessContext("t1", "u1");
    expect(result.hasPaidEntitlement).toBe(true);
    expect(prisma.membershipTier.findFirst).not.toHaveBeenCalled();
  });

  it("marks moderators and above as staff", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "m1", tenantId: "t1", userId: "u1", role: "MODERATOR", status: "ACTIVE",
    });
    prisma.entitlement.findMany.mockResolvedValue([]);

    const result = await buildAccessContext("t1", "u1");
    expect(result.isStaff).toBe(true);
  });

  it("expired entitlements are filtered by the query", async () => {
    prisma.membership.findUnique.mockResolvedValue(null);
    prisma.entitlement.findMany.mockResolvedValue([]);
    await buildAccessContext("t1", "u1");
    expect(prisma.entitlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        }),
      }),
    );
  });
});
