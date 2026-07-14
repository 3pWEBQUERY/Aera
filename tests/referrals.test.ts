import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  awardPoints: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return { default: prisma, prisma };
});
vi.mock("@/lib/gamification", () => ({ awardPoints: mocks.awardPoints }));
vi.mock("@/lib/notifications", () => ({ notify: mocks.notify }));

import prismaModule from "@/lib/prisma";
const prisma = prismaModule as unknown as PrismaMock;

import {
  ensureReferralCode,
  resolveReferrer,
  recordReferralJoin,
  recordReferralPurchase,
} from "@/lib/referrals";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureReferralCode", () => {
  it("returns the existing code without writing", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "m1", status: "ACTIVE", referralCode: "abc12345",
    });
    expect(await ensureReferralCode("t1", "u1")).toBe("abc12345");
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });

  it("generates and persists a new code (safe alphabet)", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "m1", status: "ACTIVE", referralCode: null,
    });
    prisma.membership.update.mockResolvedValue({});

    const code = await ensureReferralCode("t1", "u1");
    expect(code).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { referralCode: code } }),
    );
  });

  it("returns null for non-members and inactive members", async () => {
    prisma.membership.findUnique.mockResolvedValue(null);
    expect(await ensureReferralCode("t1", "u1")).toBeNull();

    prisma.membership.findUnique.mockResolvedValue({ id: "m1", status: "BANNED" });
    expect(await ensureReferralCode("t1", "u1")).toBeNull();
  });
});

describe("resolveReferrer", () => {
  it("normalizes the code and resolves active members only", async () => {
    prisma.membership.findFirst.mockResolvedValue({ userId: "referrer1" });
    const result = await resolveReferrer("t1", "  ABC123  ");
    expect(result).toBe("referrer1");
    expect(prisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ referralCode: "abc123", status: "ACTIVE" }),
      }),
    );
  });

  it("returns null for empty or oversized codes without querying", async () => {
    expect(await resolveReferrer("t1", "")).toBeNull();
    expect(await resolveReferrer("t1", "x".repeat(40))).toBeNull();
    expect(prisma.membership.findFirst).not.toHaveBeenCalled();
  });
});

describe("recordReferralJoin", () => {
  const input = {
    tenantId: "t1",
    tenantSlug: "demo",
    referrerId: "referrer1",
    referredId: "new1",
    referredName: "Anna",
  };

  it("links the membership, logs the conversion, awards points, notifies", async () => {
    prisma.membership.updateMany.mockResolvedValue({ count: 1 });
    prisma.referralConversion.create.mockResolvedValue({});

    await recordReferralJoin(input);

    expect(prisma.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ referredById: null }),
        data: { referredById: "referrer1" },
      }),
    );
    expect(prisma.referralConversion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "join", referrerId: "referrer1" }),
      }),
    );
    expect(mocks.awardPoints).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "REFERRAL", userId: "referrer1" }),
    );
    expect(mocks.notify).toHaveBeenCalled();
  });

  it("never lets users refer themselves", async () => {
    await recordReferralJoin({ ...input, referredId: "referrer1" });
    expect(prisma.referralConversion.create).not.toHaveBeenCalled();
    expect(mocks.awardPoints).not.toHaveBeenCalled();
  });

  it("swallows duplicate conversions (P2002) silently", async () => {
    prisma.membership.updateMany.mockResolvedValue({ count: 0 });
    prisma.referralConversion.create.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "P2002" }),
    );
    await expect(recordReferralJoin(input)).resolves.toBeUndefined();
    expect(mocks.awardPoints).not.toHaveBeenCalled();
  });
});

describe("recordReferralPurchase", () => {
  const input = {
    tenantId: "t1",
    referredUserId: "new1",
    amountCents: 5000,
    refType: "StripeSession",
    refId: "cs_1",
  };

  it("computes the commission from the tenant's referral percent", async () => {
    prisma.membership.findUnique.mockResolvedValue({ referredById: "referrer1" });
    prisma.tenant.findUnique.mockResolvedValue({ referralPercent: 10 });
    prisma.referralConversion.create.mockResolvedValue({});

    await recordReferralPurchase(input);

    expect(prisma.referralConversion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "purchase",
          amountCents: 5000,
          commissionCents: 500,
          refId: "cs_1",
        }),
      }),
    );
  });

  it("does nothing when the buyer was not referred", async () => {
    prisma.membership.findUnique.mockResolvedValue({ referredById: null });
    prisma.tenant.findUnique.mockResolvedValue({ referralPercent: 10 });
    await recordReferralPurchase(input);
    expect(prisma.referralConversion.create).not.toHaveBeenCalled();
  });

  it("clamps the percent to a sane range", async () => {
    prisma.membership.findUnique.mockResolvedValue({ referredById: "referrer1" });
    prisma.tenant.findUnique.mockResolvedValue({ referralPercent: 250 });
    prisma.referralConversion.create.mockResolvedValue({});

    await recordReferralPurchase(input);
    expect(prisma.referralConversion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ commissionCents: 5000 }), // max 100 %
      }),
    );
  });
});
