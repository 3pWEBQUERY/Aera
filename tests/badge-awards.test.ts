import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

/**
 * Auszeichnungen von Hand vergeben.
 *
 * Die interessante Stelle ist nicht das Anlegen, sondern die Abgrenzung:
 * Auszeichnung und Empfaenger muessen zur Community des angemeldeten Admins
 * gehoeren. Eine untergeschobene ID darf weder ein fremdes Konto treffen noch
 * eine fremde Auszeichnung verteilen.
 */

const mocks = vi.hoisted(() => ({
  requireTenantAdmin: vi.fn(),
  featureBlocked: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    setTenantContext: vi.fn(),
    systemPrisma: prisma,
    withTenantTransaction: (fn: (tx: typeof prisma) => unknown) => fn(prisma),
  };
});
vi.mock("@/lib/guards", () => ({
  requireTenantAdmin: mocks.requireTenantAdmin,
  requirePlatformAdmin: vi.fn(),
}));
vi.mock("@/lib/plan", () => ({
  featureBlocked: mocks.featureBlocked,
  tenantHasFeature: vi.fn(async () => true),
  getTenantPlan: vi.fn(async () => "PRO"),
  checkSpaceLimit: vi.fn(async () => null),
  checkTierLimit: vi.fn(async () => null),
  checkStaffLimit: vi.fn(async () => null),
  checkMemberLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/stripe-cleanup", () => ({
  assertStripeSubscriptionsInactive: vi.fn(),
  cancelStripeSubscriptionsImmediately: vi.fn(),
  deleteStripeConnectAccount: vi.fn(),
  StripeSubscriptionStillActiveError: class extends Error {},
}));
vi.mock("@/lib/creator-checkout", () => ({
  countOpenCreatorCheckouts: vi.fn(async () => 0),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/action-errors", () => ({
  tErr: vi.fn(async (key: string) => key),
  zodErr: vi.fn(async () => "invalidData"),
}));

import prismaModule from "@/lib/prisma";
import { awardBadgeAction, revokeBadgeAction } from "@/app/actions/dashboard";

const prisma = prismaModule as unknown as PrismaMock;

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

const input = { tenant: "demo", userId: "u1", badgeId: "b1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.featureBlocked.mockResolvedValue(null);
  mocks.requireTenantAdmin.mockResolvedValue({
    tenant: { id: "t1", slug: "demo" },
    user: { id: "owner" },
    role: "OWNER",
  });
  prisma.badge.findFirst.mockResolvedValue({ id: "b1" });
  prisma.membership.findFirst.mockResolvedValue({ userId: "u1" });
  prisma.badgeAward.create.mockResolvedValue({ id: "a1" });
  prisma.badgeAward.deleteMany.mockResolvedValue({ count: 1 });
});

describe("awardBadgeAction", () => {
  it("awards the badge to the member", async () => {
    await expect(awardBadgeAction(form(input))).resolves.toEqual({ ok: true });

    expect(prisma.badgeAward.create).toHaveBeenCalledWith({
      data: { tenantId: "t1", badgeId: "b1", userId: "u1" },
    });
  });

  it("looks up badge and member inside the admin's tenant only", async () => {
    await awardBadgeAction(form(input));

    expect(prisma.badge.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b1", tenantId: "t1" } }),
    );
    expect(prisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", tenantId: "t1" } }),
    );
  });

  it("refuses a badge that belongs to another community", async () => {
    prisma.badge.findFirst.mockResolvedValue(null);

    await expect(awardBadgeAction(form(input))).resolves.toEqual({
      error: "badgeNotFound",
    });
    expect(prisma.badgeAward.create).not.toHaveBeenCalled();
  });

  it("refuses a user who has not joined the community", async () => {
    prisma.membership.findFirst.mockResolvedValue(null);

    await expect(awardBadgeAction(form(input))).resolves.toEqual({
      error: "memberNotFound",
    });
    expect(prisma.badgeAward.create).not.toHaveBeenCalled();
  });

  it("stays quiet when the same badge is awarded twice", async () => {
    prisma.badgeAward.create.mockRejectedValue(new Error("unique constraint"));

    await expect(awardBadgeAction(form(input))).resolves.toEqual({ ok: true });
  });

  it("respects the package gate", async () => {
    mocks.featureBlocked.mockResolvedValue("planFeatureLocked");

    await expect(awardBadgeAction(form(input))).resolves.toEqual({
      error: "planFeatureLocked",
    });
    expect(prisma.badgeAward.create).not.toHaveBeenCalled();
  });
});

describe("revokeBadgeAction", () => {
  it("removes the award scoped to the tenant", async () => {
    await expect(revokeBadgeAction(form(input))).resolves.toEqual({ ok: true });

    expect(prisma.badgeAward.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", badgeId: "b1", userId: "u1" },
    });
  });

  it("refuses a member of another community", async () => {
    prisma.membership.findFirst.mockResolvedValue(null);

    await expect(revokeBadgeAction(form(input))).resolves.toEqual({
      error: "memberNotFound",
    });
    expect(prisma.badgeAward.deleteMany).not.toHaveBeenCalled();
  });

  it("refreshes the community pages, not just the dashboard", async () => {
    await revokeBadgeAction(form(input));

    const paths = mocks.revalidatePath.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/dashboard/demo/members");
    expect(paths).toContain("/c/demo");
  });
});
