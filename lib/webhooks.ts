import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import prisma, { withTenantContext } from "./prisma";
import type { WebhookDelivery, WebhookEndpoint } from "@/app/generated/prisma/client";
import { postWebhookUrl } from "./webhook-url";
import {
  decryptSecret,
  encryptSecret,
  secretNeedsRotation,
} from "./secret-encryption";

/**
 * Ausgehende Webhooks.
 *
 * Creator hinterlegen Endpoints (URL + abonnierte Events) im Dashboard unter
 * „Entwickler". `emitWebhookEvent()` stellt Events best-effort zu — ein
 * fehlgeschlagener Webhook darf nie die auslösende Aktion brechen. Jede
 * Zustellung wird als WebhookDelivery protokolliert.
 *
 * Signatur: Header `Aera-Signature: t=<unix>,v1=<hmac>` — HMAC-SHA256 über
 * `<t>.<rawBody>` mit dem Endpoint-Secret (Stripe-kompatibles Schema).
 */

export const WEBHOOK_EVENTS = [
  "member.joined",
  "order.paid",
  "subscription.created",
  "subscription.canceled",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export function generateWebhookSecret(): string {
  return "whsec_" + randomBytes(24).toString("hex");
}

export function signWebhookPayload(
  secret: string,
  timestamp: number,
  rawBody: string,
): string {
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/** Empfängerseitige Prüfung (auch von Tests genutzt). */
export function verifyWebhookSignature(
  secret: string,
  header: string,
  rawBody: string,
  toleranceSeconds = 300,
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string]),
  );
  const t = Number(parts.t);
  const v1 = parts.v1 ?? "";
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;
const CLAIM_CHUNK_SIZE = 10;
const MIN_CLAIM_WINDOW_MS = TIMEOUT_MS + 2_000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];

type DeliveryWithEndpoint = WebhookDelivery & { endpoint: WebhookEndpoint };

function nextAttemptDate(attempts: number): Date {
  const index = Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_MS.length - 1);
  return new Date(Date.now() + RETRY_DELAYS_MS[index]!);
}

async function performDelivery(delivery: DeliveryWithEndpoint): Promise<boolean> {
  const attempts = delivery.attempts + 1;
  if (!delivery.endpoint.isActive) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "EXHAUSTED",
        attempts,
        ok: false,
        error: "Endpoint is inactive",
        lastAttemptAt: new Date(),
        leaseUntil: null,
      },
    });
    return false;
  }

  const rawBody = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  let responseCode: number | null = null;
  let ok = false;
  let error: string | null = null;
  try {
    const signingSecret = decryptSecret(delivery.endpoint.secret);
    if (secretNeedsRotation(delivery.endpoint.secret)) {
      await prisma.webhookEndpoint.update({
        where: { id: delivery.endpoint.id },
        data: { secret: encryptSecret(signingSecret) },
      });
    }
    const res = await postWebhookUrl({
      url: delivery.endpoint.url,
      headers: {
        "Content-Type": "application/json",
        "Aera-Signature": signWebhookPayload(signingSecret, timestamp, rawBody),
        "Aera-Event": delivery.event,
      },
      body: rawBody,
      timeoutMs: TIMEOUT_MS,
      allowHttp: process.env.NODE_ENV !== "production",
    });
    responseCode = res.status;
    ok = res.ok && !res.redirected;
    if (res.redirected) error = "Redirects are not allowed";
    else if (!res.ok) error = `HTTP ${res.status}`;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const exhausted = !ok && attempts >= MAX_ATTEMPTS;
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      responseCode,
      ok,
      error,
      attempts,
      lastAttemptAt: new Date(),
      deliveredAt: ok ? new Date() : null,
      status: ok ? "DELIVERED" : exhausted ? "EXHAUSTED" : "RETRYING",
      nextAttemptAt: ok || exhausted ? delivery.nextAttemptAt : nextAttemptDate(attempts),
      leaseUntil: null,
    },
  });
  return ok;
}

/** Claim and process due deliveries across tenants (safe for parallel workers). */
export async function processPendingWebhookDeliveries(
  limit = 50,
  options: { deadlineAt?: number } = {},
): Promise<{ claimed: number; delivered: number; failed: number }> {
  const boundedLimit = Math.min(Math.max(limit, 1), 200);
  const deadlineAt = options.deadlineAt ?? Date.now() + 40_000;
  let claimedCount = 0;
  let delivered = 0;
  let failed = 0;
  while (
    claimedCount < boundedLimit &&
    Date.now() < deadlineAt - MIN_CLAIM_WINDOW_MS
  ) {
    const chunkLimit = Math.min(CLAIM_CHUNK_SIZE, boundedLimit - claimedCount);
    const rows =
      (await prisma.$queryRaw<Array<{ delivery_id: string; tenant_id: string }>>`
        SELECT * FROM aera_claim_webhook_deliveries(${chunkLimit})
      `) ?? [];
    if (rows.length === 0) break;
    claimedCount += rows.length;

    const outcomes = await Promise.all(
      rows.map(async (row) => {
        try {
          return await withTenantContext(row.tenant_id, async () => {
            const delivery = await prisma.webhookDelivery.findUnique({
              where: { id: row.delivery_id },
              include: { endpoint: true },
            });
            return delivery ? performDelivery(delivery) : false;
          });
        } catch (error) {
          console.error(`Webhook retry failed (${row.delivery_id}):`, error);
          // The short bounded chunk completes well inside the database lease;
          // a crashed row becomes claimable again after that lease expires.
          return false;
        }
      }),
    );
    for (const ok of outcomes) {
      if (ok) delivered++;
      else failed++;
    }
    if (rows.length < chunkLimit) break;
  }
  return { claimed: claimedCount, delivered, failed };
}

/**
 * Stellt ein Event an alle aktiven, abonnierten Endpoints des Tenants zu.
 * Wird bewusst NICHT geworfen — Aufrufer müssen nichts behandeln.
 */
export async function emitWebhookEvent(
  tenantId: string,
  event: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { tenantId, isActive: true, events: { has: event } },
    });
    if (endpoints.length === 0) return;

    const eventId = `evt_${randomBytes(12).toString("hex")}`;
    const payload = {
      id: eventId,
      type: event,
      createdAt: new Date().toISOString(),
      data,
    };
    const storedPayload = JSON.parse(JSON.stringify(payload)) as object;

    await Promise.all(
      endpoints.map(async (ep) => {
        try {
          const delivery = await prisma.webhookDelivery.create({
            data: {
              tenantId,
              endpointId: ep.id,
              eventId,
              event,
              payload: storedPayload,
            },
          });
          await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "PROCESSING",
              leaseUntil: new Date(Date.now() + 2 * 60_000),
            },
          });
          await performDelivery({ ...delivery, status: "PROCESSING", endpoint: ep });
        } catch (error) {
          // P2002 means this endpoint/event pair is already queued.
          if ((error as { code?: string }).code !== "P2002") {
            console.error(`Webhook enqueue failed (${event}, ${ep.id}):`, error);
          }
        }
      }),
    );
  } catch (e) {
    console.error(`emitWebhookEvent(${event}) failed:`, e);
  }
}
