import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(async (): Promise<{ ok: boolean; error?: string; id?: string }> => ({
    ok: true,
    id: "resend-1",
  })),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    withTenantContext: (_: string, fn: () => unknown) => fn(),
  };
});
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));

import prismaModule from "@/lib/prisma";
import {
  processPendingNewsletterDeliveries,
  queueNewsletterCampaign,
} from "@/lib/newsletter-delivery";

const prisma = prismaModule as unknown as PrismaMock;

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    tenantId: "t1",
    campaignId: "c1",
    userId: "u1",
    recipientEmail: "u1@example.com",
    subject: "Neuigkeiten",
    html: "<p>Hallo</p>",
    status: "PROCESSING",
    attempts: 0,
    nextAttemptAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendEmail.mockResolvedValue({ ok: true, id: "resend-1" });
  prisma.$queryRaw.mockResolvedValue([{ delivery_id: "d1", tenant_id: "t1" }]);
  prisma.newsletterDelivery.findUnique.mockResolvedValue(delivery());
  prisma.newsletterDelivery.update.mockResolvedValue({});
  prisma.emailEvent.create.mockResolvedValue({});
  prisma.newsletterCampaign.updateMany.mockResolvedValue({ count: 1 });
});

describe("queueNewsletterCampaign", () => {
  it("stores immutable recipient snapshots and ignores duplicate queue attempts", async () => {
    prisma.newsletterDelivery.createMany.mockResolvedValue({ count: 2 });

    const count = await queueNewsletterCampaign({
      tenantId: "t1",
      campaignId: "c1",
      subject: "Neuigkeiten",
      html: "<p>Hallo</p>",
      recipients: [
        { id: "u1", email: "u1@example.com" },
        { id: "u2", email: "u2@example.com" },
      ],
    });

    expect(count).toBe(2);
    expect(prisma.newsletterDelivery.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: "u1", recipientEmail: "u1@example.com" }),
        expect.objectContaining({ userId: "u2", recipientEmail: "u2@example.com" }),
      ],
      skipDuplicates: true,
    });
  });
});

describe("processPendingNewsletterDeliveries", () => {
  it("records a successful send idempotently and completes the campaign", async () => {
    prisma.newsletterDelivery.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    const result = await processPendingNewsletterDeliveries();

    expect(result).toEqual({ claimed: 1, sent: 1, retrying: 0, exhausted: 0 });
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "u1@example.com",
        idempotencyKey: "newsletter-d1",
      }),
    );
    expect(prisma.emailEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "SENT", dedupeKey: "newsletter:d1:sent" }),
    });
    expect(prisma.newsletterDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT", attempts: 1 }) }),
    );
    expect(prisma.newsletterCampaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1", tenantId: "t1", status: "SENDING" },
        data: expect.objectContaining({ status: "SENT", recipientCount: 1 }),
      }),
    );
  });

  it("keeps a failed send queued for a later retry", async () => {
    mocks.sendEmail.mockResolvedValueOnce({ ok: false, error: "Resend 503" });
    prisma.newsletterDelivery.count.mockResolvedValueOnce(1);

    const result = await processPendingNewsletterDeliveries();

    expect(result).toEqual({ claimed: 1, sent: 0, retrying: 1, exhausted: 0 });
    expect(prisma.newsletterDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "RETRYING",
          attempts: 1,
          error: "Resend 503",
          nextAttemptAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.emailEvent.create).not.toHaveBeenCalled();
    expect(prisma.newsletterCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("records the fifth failure and completes the processed campaign", async () => {
    prisma.newsletterDelivery.findUnique.mockResolvedValue(delivery({ attempts: 4 }));
    mocks.sendEmail.mockResolvedValueOnce({ ok: false, error: "Resend 503" });
    prisma.newsletterDelivery.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    const result = await processPendingNewsletterDeliveries();

    expect(result).toEqual({ claimed: 1, sent: 0, retrying: 0, exhausted: 1 });
    expect(prisma.emailEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "FAILED", dedupeKey: "newsletter:d1:failed" }),
    });
    expect(prisma.newsletterDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "EXHAUSTED", attempts: 5 }) }),
    );
    expect(prisma.newsletterCampaign.updateMany).toHaveBeenCalled();
  });

  it("tolerates a duplicate terminal event after crash recovery", async () => {
    prisma.emailEvent.create.mockRejectedValue(Object.assign(new Error("duplicate"), { code: "P2002" }));
    prisma.newsletterDelivery.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    const result = await processPendingNewsletterDeliveries();

    expect(result.sent).toBe(1);
    expect(prisma.newsletterDelivery.update).toHaveBeenCalled();
  });
});
