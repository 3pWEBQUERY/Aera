import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(async (): Promise<{ ok: boolean; error?: string; id?: string }> => ({ ok: true })),
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
const prisma = prismaModule as unknown as PrismaMock;

import { runAutomations, renderAutomationBody } from "@/lib/automations";

const DAY = 86_400_000;

function step(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    tenantId: "t1",
    dayOffset: 3,
    subject: "Hallo {{name}}",
    body: "Willkommen bei {{community}}!",
    isActive: true,
    tenant: { id: "t1", name: "Demo", primaryColor: "#123456" },
    ...overrides,
  };
}

function member(userId: string, joinedDaysAgo: number) {
  return {
    email: `${userId}@example.com`,
    optedInAt: new Date(Date.now() - joinedDaysAgo * DAY),
    user: { id: userId, name: "Anna", email: `${userId}@example.com` },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.automationDelivery.create.mockResolvedValue({ id: "d1" });
  prisma.automationDelivery.update.mockResolvedValue({});
});

function mockRun(args: {
  memberships?: ReturnType<typeof member>[];
  claimed?: boolean;
  delivery?: Record<string, unknown>;
}) {
  prisma.$queryRaw
    .mockResolvedValueOnce([{ step_id: "s1", tenant_id: "t1" }])
    .mockResolvedValueOnce(
      args.claimed === false ? [] : [{ delivery_id: "d1", tenant_id: "t1" }],
    );
  prisma.automationStep.findUnique.mockResolvedValue(step());
  prisma.newsletterConsent.findMany.mockResolvedValue(args.memberships ?? [member("u1", 5)]);
  prisma.automationDelivery.findUnique.mockResolvedValue({
    id: "d1",
    tenantId: "t1",
    stepId: "s1",
    userId: "u1",
    recipientEmail: "u1@example.com",
    subject: "Hallo Anna",
    html: "<html>Willkommen bei Demo!</html>",
    status: "PROCESSING",
    attempts: 0,
    nextAttemptAt: new Date(),
    unsubscribeUrl: "http://localhost:3000/api/newsletter/unsubscribe/token",
    ...args.delivery,
  });
}

describe("renderAutomationBody", () => {
  it("replaces all placeholders", () => {
    expect(
      renderAutomationBody("Hi {{name}}, willkommen bei {{community}}! ({{name}})", {
        name: "Anna",
        community: "Demo",
      }),
    ).toBe("Hi Anna, willkommen bei Demo! (Anna)");
  });
});

describe("runAutomations", () => {
  it("sends due steps to eligible members and records deliveries", async () => {
    mockRun({});

    const result = await runAutomations();

    expect(result.sent).toBe(1);
    expect(result.queued).toBe(1);
    expect(prisma.automationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          stepId: "s1",
          userId: "u1",
          recipientEmail: "u1@example.com",
          subject: "Hallo Anna",
        }),
      }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "u1@example.com",
        subject: "Hallo Anna",
        idempotencyKey: "automation-d1",
      }),
    );
    // Nur verifizierte Adressen werden überhaupt selektiert.
    expect(prisma.newsletterConsent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: expect.objectContaining({
            emailVerifiedAt: { not: null },
            automationDeliveries: { none: { stepId: "s1" } },
          }),
        }),
        orderBy: [{ optedInAt: "asc" }, { id: "asc" }],
      }),
    );
  });

  it("skips members who already received the step", async () => {
    mockRun({ claimed: false });
    prisma.automationDelivery.create.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "P2002" }),
    );

    const result = await runAutomations();
    expect(result.sent).toBe(0);
    expect(result.queued).toBe(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("is race-safe: a duplicate delivery insert (P2002) skips the send", async () => {
    mockRun({ claimed: false });
    prisma.automationDelivery.create.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "P2002" }),
    );

    const result = await runAutomations();
    expect(result.sent).toBe(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("does nothing without active steps", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await runAutomations();
    expect(result.sent).toBe(0);
    expect(result.tenants).toBe(0);
    expect(prisma.newsletterConsent.findMany).not.toHaveBeenCalled();
  });

  it("persists a failed send for a later retry", async () => {
    mockRun({});
    mocks.sendEmail.mockResolvedValueOnce({ ok: false, error: "Resend 503" });

    const result = await runAutomations();

    expect(result).toEqual({ sent: 0, tenants: 1, queued: 1, failed: 1 });
    expect(prisma.automationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          status: "RETRYING",
          attempts: 1,
          error: "Resend 503",
          nextAttemptAt: expect.any(Date),
        }),
      }),
    );
  });

  it("marks the fifth failed attempt exhausted", async () => {
    mockRun({ delivery: { attempts: 4 } });
    mocks.sendEmail.mockResolvedValueOnce({ ok: false, error: "Resend 503" });

    const result = await runAutomations();

    expect(result.failed).toBe(1);
    expect(prisma.automationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "EXHAUSTED", attempts: 5 }),
      }),
    );
  });

  it("quarantines legacy rows without an immutable email snapshot", async () => {
    mockRun({ delivery: { recipientEmail: "", subject: "", html: "" } });

    const result = await runAutomations();

    expect(result.failed).toBe(1);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(prisma.automationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          status: "EXHAUSTED",
          error: "Legacy delivery is missing its immutable email snapshot",
        }),
      }),
    );
  });
});
