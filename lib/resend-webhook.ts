import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { systemPrisma, withTenantContext } from "./prisma";
import { suppressMarketingEmail } from "./marketing-consent";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

export interface ResendWebhookPayload {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
  };
}

function signingKey(secret: string): Buffer {
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return Buffer.from(encoded, "base64");
}

export function verifyResendWebhookSignature(input: {
  body: string;
  id: string;
  timestamp: string;
  signature: string;
  secret: string;
  nowSeconds?: number;
}): boolean {
  const timestamp = Number(input.timestamp);
  if (!Number.isInteger(timestamp)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > MAX_CLOCK_SKEW_SECONDS) return false;
  let key: Buffer;
  try {
    key = signingKey(input.secret);
  } catch {
    return false;
  }
  if (key.length < 16) return false;
  const expected = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.body}`)
    .digest();
  for (const item of input.signature.split(" ")) {
    const [version, encoded] = item.split(",", 2);
    if (version !== "v1" || !encoded) continue;
    try {
      const supplied = Buffer.from(encoded, "base64");
      if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
        return true;
      }
    } catch {
      // Try the next signature during signing-secret rotation.
    }
  }
  return false;
}

export function parseAndVerifyResendWebhook(input: {
  body: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret?: string;
}): { id: string; event: ResendWebhookPayload } | null {
  if (!input.id || !input.timestamp || !input.signature) return null;
  const secret = input.secret ?? env.RESEND_WEBHOOK_SECRET;
  if (
    !secret ||
    !verifyResendWebhookSignature({
      body: input.body,
      id: input.id,
      timestamp: input.timestamp,
      signature: input.signature,
      secret,
    })
  ) {
    return null;
  }
  try {
    const event = JSON.parse(input.body) as ResendWebhookPayload;
    if (!event || typeof event.type !== "string") return null;
    return { id: input.id, event };
  } catch {
    return null;
  }
}

export async function processResendWebhook(
  eventId: string,
  event: ResendWebhookPayload,
): Promise<"processed" | "duplicate"> {
  const providerMessageId = event.data?.email_id ?? null;
  const existing = await systemPrisma.emailWebhookEvent.findUnique({
    where: { id: eventId },
  });
  if (existing?.processedAt) return "duplicate";
  if (!existing) {
    try {
      await systemPrisma.emailWebhookEvent.create({
        data: { id: eventId, type: event.type, providerMessageId },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }

  if (event.type === "email.bounced" || event.type === "email.complained") {
    const newsletter = providerMessageId
      ? await systemPrisma.newsletterDelivery.findFirst({
          where: { providerMessageId },
          select: {
            id: true,
            tenantId: true,
            campaignId: true,
            userId: true,
            recipientEmail: true,
          },
        })
      : null;
    const automation = !newsletter && providerMessageId
      ? await systemPrisma.automationDelivery.findFirst({
          where: { providerMessageId },
          select: { id: true, tenantId: true, userId: true, recipientEmail: true },
        })
      : null;
    const delivery = newsletter ?? automation;
    if (delivery) {
      const reason = event.type === "email.bounced" ? "BOUNCE" : "COMPLAINT";
      await suppressMarketingEmail({
        tenantId: delivery.tenantId,
        userId: delivery.userId,
        email: delivery.recipientEmail,
        reason,
        source: `RESEND_WEBHOOK:${eventId}`,
      });
      if (newsletter) {
        await withTenantContext(newsletter.tenantId, async () => {
          try {
            await systemPrisma.emailEvent.create({
              data: {
                tenantId: newsletter.tenantId,
                campaignId: newsletter.campaignId,
                userId: newsletter.userId,
                email: newsletter.recipientEmail,
                type: reason === "BOUNCE" ? "BOUNCED" : "COMPLAINED",
                dedupeKey: `resend:${eventId}`,
              },
            });
          } catch (error) {
            if ((error as { code?: string }).code !== "P2002") throw error;
          }
        });
      }
    }
  }

  await systemPrisma.emailWebhookEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date() },
  });
  return "processed";
}
