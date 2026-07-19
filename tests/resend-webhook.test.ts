import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({ suppressMarketingEmail: vi.fn() }));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    systemPrisma: prisma,
    withTenantContext: (_: string, fn: () => unknown) => fn(),
  };
});
vi.mock("@/lib/marketing-consent", () => ({
  suppressMarketingEmail: mocks.suppressMarketingEmail,
}));

import { systemPrisma } from "@/lib/prisma";
import {
  processResendWebhook,
  verifyResendWebhookSignature,
} from "@/lib/resend-webhook";

const prisma = systemPrisma as unknown as PrismaMock;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.emailWebhookEvent.findUnique.mockResolvedValue(null);
  prisma.emailWebhookEvent.create.mockResolvedValue({ id: "evt-1" });
  prisma.emailWebhookEvent.update.mockResolvedValue({});
  prisma.emailEvent.create.mockResolvedValue({});
  prisma.automationDelivery.findFirst.mockResolvedValue(null);
});

it("verifies the raw Svix payload and rejects stale delivery replays", () => {
  const key = Buffer.from("0123456789abcdef0123456789abcdef");
  const secret = `whsec_${key.toString("base64")}`;
  const body = '{"type":"email.bounced"}';
  const id = "evt-1";
  const timestamp = "1700000000";
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");

  expect(verifyResendWebhookSignature({
    body,
    id,
    timestamp,
    signature: `v1,${signature}`,
    secret,
    nowSeconds: 1700000000,
  })).toBe(true);
  expect(verifyResendWebhookSignature({
    body,
    id,
    timestamp,
    signature: `v1,${signature}`,
    secret,
    nowSeconds: 1700001000,
  })).toBe(false);
});

describe("Resend suppression processing", () => {
  it("deduplicates a bounce and suppresses the matching marketing recipient", async () => {
    prisma.newsletterDelivery.findFirst.mockResolvedValue({
      id: "d1",
      tenantId: "t1",
      campaignId: "c1",
      userId: "u1",
      recipientEmail: "member@example.com",
    });

    await expect(processResendWebhook("evt-1", {
      type: "email.bounced",
      data: { email_id: "provider-1", to: ["member@example.com"] },
    })).resolves.toBe("processed");

    expect(mocks.suppressMarketingEmail).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "BOUNCE", tenantId: "t1" }),
    );
    expect(prisma.emailEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "BOUNCED", dedupeKey: "resend:evt-1" }),
    });
    expect(prisma.emailWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { processedAt: expect.any(Date) } }),
    );
  });

  it("does not process a completed webhook twice", async () => {
    prisma.emailWebhookEvent.findUnique.mockResolvedValue({ processedAt: new Date() });
    await expect(processResendWebhook("evt-1", { type: "email.complained" }))
      .resolves.toBe("duplicate");
    expect(mocks.suppressMarketingEmail).not.toHaveBeenCalled();
  });
});
