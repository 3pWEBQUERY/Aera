import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    systemPrisma: prisma,
    withTenantContext: (_: string, fn: () => unknown) => fn(),
    withTenantTransactionFor: (_: string, fn: (tx: unknown) => unknown) => fn(prisma),
  };
});

import prismaModule from "@/lib/prisma";
import {
  createNewsletterUnsubscribeToken,
  getNewsletterUnsubscribeContext,
  isNewsletterRecipientEligible,
  optInToNewsletter,
  withdrawNewsletterConsent,
  withdrawNewsletterConsentByToken,
} from "@/lib/marketing-consent";

const prisma = prismaModule as unknown as PrismaMock;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.newsletterConsent.upsert.mockResolvedValue({ id: "consent-1" });
  prisma.emailSuppression.updateMany.mockResolvedValue({ count: 0 });
  prisma.emailSuppression.upsert.mockResolvedValue({ id: "suppression-1" });
  prisma.newsletterConsentEvent.create.mockResolvedValue({ id: "event-1" });
});

describe("newsletter consent evidence", () => {
  it("creates an explicit opt-in and an append-only evidence event", async () => {
    prisma.newsletterConsent.findUnique.mockResolvedValue(null);

    await optInToNewsletter({
      tenantId: "t1",
      userId: "u1",
      email: " Member@Example.com ",
      source: "COMMUNITY_SIGNUP",
    });

    expect(prisma.newsletterConsent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          email: "member@example.com",
          status: "OPTED_IN",
          optedInSource: "COMMUNITY_SIGNUP",
        }),
      }),
    );
    expect(prisma.newsletterConsentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "OPTED_IN", source: "COMMUNITY_SIGNUP" }),
    });
    expect(prisma.emailSuppression.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ reason: "UNSUBSCRIBED" }) }),
    );
  });

  it("persists withdrawal evidence and an active unsubscribe suppression", async () => {
    prisma.newsletterConsent.findUnique.mockResolvedValue({
      id: "consent-1",
      status: "OPTED_IN",
      email: "member@example.com",
    });

    await withdrawNewsletterConsent({
      tenantId: "t1",
      userId: "u1",
      email: "member@example.com",
      source: "MEMBER_ACCOUNT",
    });

    expect(prisma.newsletterConsentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "WITHDRAWN", source: "MEMBER_ACCOUNT" }),
    });
    expect(prisma.emailSuppression.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: "UNSUBSCRIBED" }),
        update: expect.objectContaining({ liftedAt: null }),
      }),
    );
  });

  it("requires verification, active membership, matching email and no suppression", async () => {
    prisma.newsletterConsent.findUnique.mockResolvedValue({
      status: "OPTED_IN",
      email: "member@example.com",
      user: {
        email: "member@example.com",
        emailVerifiedAt: new Date(),
        memberships: [{ id: "m1" }],
      },
    });
    prisma.emailSuppression.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    await expect(isNewsletterRecipientEligible({
      tenantId: "t1",
      userId: "u1",
      email: "member@example.com",
    })).resolves.toBe(true);
    await expect(isNewsletterRecipientEligible({
      tenantId: "t1",
      userId: "u1",
      email: "member@example.com",
    })).resolves.toBe(false);
  });
});

describe("signed unsubscribe links", () => {
  it("rejects tampering and withdraws a valid delivery without login", async () => {
    const token = createNewsletterUnsubscribeToken({
      deliveryId: "d1",
      tenantId: "t1",
      userId: "u1",
      kind: "newsletter",
    });
    prisma.newsletterDelivery.findFirst.mockResolvedValue({
      tenantId: "t1",
      userId: "u1",
      recipientEmail: "member@example.com",
      tenant: { name: "Demo" },
    });
    prisma.newsletterConsent.findUnique.mockResolvedValue({
      id: "consent-1",
      status: "OPTED_IN",
      email: "member@example.com",
    });

    await expect(getNewsletterUnsubscribeContext(`${token}x`)).resolves.toBeNull();
    await expect(withdrawNewsletterConsentByToken(token, "LIST_UNSUBSCRIBE_POST")).resolves.toBe(true);
    expect(prisma.emailSuppression.upsert).toHaveBeenCalled();
  });
});
