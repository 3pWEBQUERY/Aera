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
    systemPrisma: prisma,
    withTenantContext: (_: string, fn: () => unknown) => fn(),
  };
});
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  renderCampaignHtml: (args: { body: string }) => `<html>${args.body}</html>`,
}));
vi.mock("@/lib/marketing-consent", () => ({
  appendUnsubscribeFooter: (html: string) => `${html}<p>unsubscribe</p>`,
  newsletterUnsubscribeUrls: () => ({
    apiUrl: "http://localhost:3000/api/newsletter/unsubscribe/token",
    pageUrl: "http://localhost:3000/unsubscribe/token",
  }),
  isNewsletterRecipientEligible: vi.fn(async () => true),
}));

import prismaModule from "@/lib/prisma";
import {
  processPendingNewsletterDeliveries,
  queueNewsletterCampaign,
  queueNewsletterAudienceBatch,
  dispatchNewsletterCampaigns,
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
    unsubscribeUrl: "http://localhost:3000/api/newsletter/unsubscribe/token",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.newsletterDelivery.count.mockReset();
  prisma.newsletterCampaign.findMany.mockReset();
  prisma.newsletterCampaign.updateMany.mockReset();
  prisma.newsletterConsent.findMany.mockReset();
  prisma.newsletterDelivery.createMany.mockReset();
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

  it("snapshots large audiences in a bounded resumable page", async () => {
    prisma.newsletterConsent.findMany.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) => ({
        email: `u${index}@example.com`,
        user: { id: `u${index}`, email: `u${index}@example.com` },
      })),
    );
    prisma.newsletterDelivery.createMany.mockResolvedValue({ count: 500 });
    prisma.newsletterDelivery.count.mockResolvedValue(500);
    prisma.newsletterCampaign.updateMany.mockResolvedValue({ count: 1 });

    const result = await queueNewsletterAudienceBatch({
      id: "c-large",
      tenantId: "t1",
      subject: "Groß",
      body: "Hallo",
      segmentId: null,
      status: "SENDING",
      scheduledAt: null,
      tenant: { name: "Demo", primaryColor: "#123456" },
    });

    expect(result).toEqual({ queued: 500, total: 500, hasMore: true });
    expect(prisma.newsletterConsent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 501 }),
    );
    expect(prisma.newsletterDelivery.createMany.mock.calls[0]?.[0].data).toHaveLength(500);
  });
});

describe("dispatchNewsletterCampaigns", () => {
  it("atomically activates a due scheduled campaign and snapshots recipients", async () => {
    const scheduledAt = new Date(Date.now() - 60_000);
    prisma.newsletterCampaign.findMany.mockResolvedValue([
      {
        id: "c-scheduled",
        tenantId: "t1",
        subject: "Morgenpost",
        body: "Hallo zusammen",
        segmentId: null,
        status: "SCHEDULED",
        scheduledAt,
        tenant: { name: "Demo", primaryColor: "#123456" },
      },
    ]);
    prisma.newsletterCampaign.updateMany.mockResolvedValue({ count: 1 });
    prisma.newsletterConsent.findMany.mockResolvedValue([
      { email: "u1@example.com", user: { id: "u1", email: "u1@example.com" } },
    ]);
    prisma.newsletterDelivery.createMany.mockResolvedValue({ count: 1 });
    prisma.newsletterDelivery.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const result = await dispatchNewsletterCampaigns({ now: new Date() });

    expect(result).toEqual({ claimed: 1, queued: 1, completed: 1, failed: 0 });
    expect(prisma.newsletterCampaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "c-scheduled", status: "SCHEDULED" }),
        data: { status: "SENDING" },
      }),
    );
    expect(prisma.newsletterDelivery.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ campaignId: "c-scheduled", userId: "u1" })],
        skipDuplicates: true,
      }),
    );
  });

  it("finishes an empty scheduled campaign instead of leaving it stuck", async () => {
    prisma.newsletterCampaign.findMany.mockResolvedValue([
      {
        id: "c-empty",
        tenantId: "t1",
        subject: "Leer",
        body: "Niemand im Segment",
        segmentId: null,
        status: "SENDING",
        scheduledAt: new Date(Date.now() - 60_000),
        tenant: { name: "Demo", primaryColor: "#123456" },
      },
    ]);
    prisma.newsletterConsent.findMany.mockResolvedValue([]);
    prisma.newsletterDelivery.count.mockResolvedValue(0);
    prisma.newsletterCampaign.updateMany.mockResolvedValue({ count: 1 });

    const result = await dispatchNewsletterCampaigns();

    expect(result).toEqual({ claimed: 1, queued: 0, completed: 1, failed: 0 });
    expect(prisma.newsletterCampaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "c-empty", status: "SENDING" }),
        data: expect.objectContaining({ status: "SENT", recipientCount: 0 }),
      }),
    );
  });
});

describe("processPendingNewsletterDeliveries", () => {
  it("does not claim a provider batch after its execution budget is depleted", async () => {
    const result = await processPendingNewsletterDeliveries(200, {
      deadlineAt: Date.now() + 1_000,
    });

    expect(result).toEqual({ claimed: 0, sent: 0, retrying: 0, suppressed: 0, exhausted: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("records a successful send idempotently and completes the campaign", async () => {
    prisma.newsletterDelivery.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    const result = await processPendingNewsletterDeliveries();

    expect(result).toEqual({ claimed: 1, sent: 1, retrying: 0, suppressed: 0, exhausted: 0 });
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "u1@example.com",
        idempotencyKey: "newsletter-d1",
        category: "marketing",
        unsubscribeUrl: "http://localhost:3000/api/newsletter/unsubscribe/token",
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

    expect(result).toEqual({ claimed: 1, sent: 0, retrying: 1, suppressed: 0, exhausted: 0 });
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

    expect(result).toEqual({ claimed: 1, sent: 0, retrying: 0, suppressed: 0, exhausted: 1 });
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
