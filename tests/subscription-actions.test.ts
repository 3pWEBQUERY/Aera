import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return { default: prisma, prisma };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/env", () => ({ features: { stripe: true } }));
vi.mock("@/lib/stripe", () => ({ cancelSubscriptionAtPeriodEnd: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/action-errors", () => ({
  getErrorTranslator: vi.fn(async () => (key: string) => key),
}));

import prismaModule from "@/lib/prisma";
import { leaveOwnCommunityAction } from "@/app/actions/subscription";

const prisma = prismaModule as unknown as PrismaMock;

function form(): FormData {
  const fd = new FormData();
  fd.set("tenant", "demo");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
  prisma.tenant.findUnique.mockResolvedValue({ id: "t1", slug: "demo" });
  prisma.membership.findUnique.mockResolvedValue({
    id: "m1",
    tenantId: "t1",
    userId: "u1",
    role: "MEMBER",
    tier: { priceCents: 1900 },
  });
  prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
  prisma.entitlement.deleteMany.mockResolvedValue({ count: 1 });
  prisma.membership.delete.mockResolvedValue({});
});

describe("leaveOwnCommunityAction", () => {
  it("does not remove a membership while Stripe can still charge it", async () => {
    prisma.subscription.findFirst.mockResolvedValue({ id: "sub_local" });

    await leaveOwnCommunityAction(form());

    expect(prisma.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stripeSubscriptionId: { not: null },
          status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
        }),
      }),
    );
    expect(prisma.membership.delete).not.toHaveBeenCalled();
    expect(prisma.entitlement.deleteMany).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("allows leaving when no live Stripe subscription exists", async () => {
    prisma.subscription.findFirst.mockResolvedValue(null);

    await leaveOwnCommunityAction(form());

    expect(prisma.membership.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
    expect(mocks.redirect).toHaveBeenCalledWith("/c/demo");
  });
});
