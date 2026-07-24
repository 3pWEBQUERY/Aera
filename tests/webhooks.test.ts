import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const httpMocks = vi.hoisted(() => ({ postWebhookUrl: vi.fn() }));
const planMocks = vi.hoisted(() => ({ tenantHasFeature: vi.fn(async () => true) }));

// Webhook delivery is a paid capability; the package check is stubbed here and
// exercised explicitly in the "package gate" test below.
vi.mock("@/lib/plan", () => ({ tenantHasFeature: planMocks.tenantHasFeature }));

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
vi.mock("@/lib/webhook-url", () => ({
  validateWebhookUrl: vi.fn(async (url: string) => ({ ok: true, url })),
  postWebhookUrl: httpMocks.postWebhookUrl,
}));

import prismaModule from "@/lib/prisma";
const prisma = prismaModule as unknown as PrismaMock;

import {
  signWebhookPayload,
  verifyWebhookSignature,
  generateWebhookSecret,
  emitWebhookEvent,
  processPendingWebhookDeliveries,
} from "@/lib/webhooks";

describe("webhook signature", () => {
  const secret = "whsec_test123";
  const body = JSON.stringify({ type: "member.joined", data: { x: 1 } });

  it("signs and verifies a payload roundtrip", () => {
    const t = Math.floor(Date.now() / 1000);
    const header = signWebhookPayload(secret, t, body);
    expect(header).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(verifyWebhookSignature(secret, header, body)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const t = Math.floor(Date.now() / 1000);
    const header = signWebhookPayload(secret, t, body);
    expect(verifyWebhookSignature(secret, header, body + "x")).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const t = Math.floor(Date.now() / 1000);
    const header = signWebhookPayload(secret, t, body);
    expect(verifyWebhookSignature("whsec_other", header, body)).toBe(false);
  });

  it("rejects stale timestamps (replay protection)", () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const header = signWebhookPayload(secret, stale, body);
    expect(verifyWebhookSignature(secret, header, body)).toBe(false);
  });

  it("generates distinct whsec_ secrets", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).toMatch(/^whsec_[a-f0-9]{48}$/);
    expect(a).not.toBe(b);
  });
});

describe("emitWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.webhookDelivery.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        id: "delivery_1",
        responseCode: null,
        ok: false,
        error: null,
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
        lastAttemptAt: null,
        deliveredAt: null,
        leaseUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.data,
      }),
    );
    prisma.webhookDelivery.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delivers nothing when the package does not include webhooks", async () => {
    planMocks.tenantHasFeature.mockResolvedValueOnce(false);
    await emitWebhookEvent("t1", "member.joined", { a: 1 });
    expect(prisma.webhookEndpoint.findMany).not.toHaveBeenCalled();
    expect(httpMocks.postWebhookUrl).not.toHaveBeenCalled();
  });

  it("does nothing without subscribed endpoints", async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([]);
    await emitWebhookEvent("t1", "member.joined", { a: 1 });
    expect(httpMocks.postWebhookUrl).not.toHaveBeenCalled();
  });

  it("POSTs a signed payload and logs the delivery", async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([
      { id: "ep1", url: "https://example.com/hook", secret: "whsec_x", events: ["member.joined"], isActive: true },
    ]);
    httpMocks.postWebhookUrl.mockResolvedValue({ status: 200, ok: true, redirected: false });

    await emitWebhookEvent("t1", "member.joined", { memberName: "Anna" });

    expect(httpMocks.postWebhookUrl).toHaveBeenCalledTimes(1);
    const [init] = httpMocks.postWebhookUrl.mock.calls[0]!;
    expect(init.url).toBe("https://example.com/hook");
    expect(init.headers["Aera-Event"]).toBe("member.joined");
    // Die Signatur muss zum gesendeten Body passen.
    expect(
      verifyWebhookSignature("whsec_x", init.headers["Aera-Signature"], init.body),
    ).toBe(true);
    const body = JSON.parse(init.body);
    expect(body.type).toBe("member.joined");
    expect(body.data.memberName).toBe("Anna");

    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ endpointId: "ep1", eventId: expect.stringMatching(/^evt_/) }),
      }),
    );
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "delivery_1" },
        data: expect.objectContaining({
          status: "DELIVERED",
          ok: true,
          responseCode: 200,
          attempts: 1,
        }),
      }),
    );
  });

  it("logs failed deliveries without throwing", async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([
      { id: "ep1", url: "https://down.example.com", secret: "whsec_x", events: ["order.paid"], isActive: true },
    ]);
    httpMocks.postWebhookUrl.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      emitWebhookEvent("t1", "order.paid", {}),
    ).resolves.toBeUndefined();

    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "delivery_1" },
        data: expect.objectContaining({
          status: "RETRYING",
          ok: false,
          error: "ECONNREFUSED",
          attempts: 1,
          nextAttemptAt: expect.any(Date),
        }),
      }),
    );
  });

  it("rejects redirects instead of following an unchecked destination", async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([
      { id: "ep1", url: "https://example.com/hook", secret: "whsec_x", events: ["order.paid"], isActive: true },
    ]);
    httpMocks.postWebhookUrl.mockResolvedValue({ status: 302, ok: false, redirected: true });

    await emitWebhookEvent("t1", "order.paid", {});

    expect(httpMocks.postWebhookUrl).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/hook" }),
    );
    expect(prisma.webhookDelivery.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ok: false, error: "Redirects are not allowed" }),
      }),
    );
  });

  it("claims and successfully retries a persisted delivery", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { delivery_id: "delivery_retry", tenant_id: "t1" },
    ]);
    prisma.webhookDelivery.findUnique.mockResolvedValue({
      id: "delivery_retry",
      tenantId: "t1",
      endpointId: "ep1",
      eventId: "evt_retry",
      event: "order.paid",
      payload: { id: "evt_retry", type: "order.paid", data: {} },
      responseCode: null,
      ok: false,
      error: "HTTP 500",
      status: "PROCESSING",
      attempts: 1,
      nextAttemptAt: new Date(),
      lastAttemptAt: new Date(),
      deliveredAt: null,
      leaseUntil: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      endpoint: {
        id: "ep1",
        tenantId: "t1",
        url: "https://example.com/hook",
        secret: "whsec_x",
        events: ["order.paid"],
        isActive: true,
        createdAt: new Date(),
      },
    });
    httpMocks.postWebhookUrl.mockResolvedValue({ status: 204, ok: true, redirected: false });

    const result = await processPendingWebhookDeliveries(10);

    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0 });
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "delivery_retry" },
        data: expect.objectContaining({ status: "DELIVERED", attempts: 2 }),
      }),
    );
  });

  it("stops retrying after the fifth failed attempt", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { delivery_id: "delivery_last", tenant_id: "t1" },
    ]);
    prisma.webhookDelivery.findUnique.mockResolvedValue({
      id: "delivery_last",
      tenantId: "t1",
      endpointId: "ep1",
      eventId: "evt_last",
      event: "order.paid",
      payload: { id: "evt_last", type: "order.paid", data: {} },
      responseCode: 500,
      ok: false,
      error: "HTTP 500",
      status: "PROCESSING",
      attempts: 4,
      nextAttemptAt: new Date(),
      lastAttemptAt: new Date(),
      deliveredAt: null,
      leaseUntil: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      endpoint: {
        id: "ep1",
        tenantId: "t1",
        url: "https://example.com/hook",
        secret: "whsec_x",
        events: ["order.paid"],
        isActive: true,
        createdAt: new Date(),
      },
    });
    httpMocks.postWebhookUrl.mockResolvedValue({ status: 500, ok: false, redirected: false });

    const result = await processPendingWebhookDeliveries(10);

    expect(result).toEqual({ claimed: 1, delivered: 0, failed: 1 });
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "delivery_last" },
        data: expect.objectContaining({ status: "EXHAUSTED", attempts: 5 }),
      }),
    );
  });

  it("does not claim another webhook chunk after the route deadline", async () => {
    const result = await processPendingWebhookDeliveries(100, {
      deadlineAt: Date.now() + 1_000,
    });

    expect(result).toEqual({ claimed: 0, delivered: 0, failed: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
