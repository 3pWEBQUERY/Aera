import "server-only";
import prisma, { withTenantContext } from "./prisma";
import { sendEmail } from "./email";

const MAX_ATTEMPTS = 5;
const MAX_DELIVERIES_PER_RUN = 200;
const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000, 24 * 3_600_000];

export interface NewsletterRecipient {
  id: string;
  email: string;
}

export interface QueueNewsletterInput {
  tenantId: string;
  campaignId: string;
  subject: string;
  html: string;
  recipients: NewsletterRecipient[];
}

/** Persist the complete recipient snapshot before any provider call happens. */
export async function queueNewsletterCampaign(input: QueueNewsletterInput): Promise<number> {
  if (input.recipients.length === 0) return 0;
  const result = await prisma.newsletterDelivery.createMany({
    data: input.recipients.map((recipient) => ({
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      userId: recipient.id,
      recipientEmail: recipient.email,
      subject: input.subject,
      html: input.html,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

async function createTerminalEvent(input: {
  tenantId: string;
  campaignId: string;
  userId: string;
  email: string;
  deliveryId: string;
  type: "SENT" | "FAILED";
}) {
  try {
    await prisma.emailEvent.create({
      data: {
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        userId: input.userId,
        email: input.email,
        type: input.type,
        dedupeKey: `newsletter:${input.deliveryId}:${input.type.toLowerCase()}`,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
  }
}

async function finalizeCampaign(tenantId: string, campaignId: string): Promise<void> {
  await withTenantContext(tenantId, async () => {
    const active = await prisma.newsletterDelivery.count({
      where: {
        campaignId,
        status: { in: ["PENDING", "PROCESSING", "RETRYING"] },
      },
    });
    if (active > 0) return;
    const total = await prisma.newsletterDelivery.count({ where: { campaignId } });
    await prisma.newsletterCampaign.updateMany({
      where: { id: campaignId, tenantId, status: "SENDING" },
      data: { status: "SENT", sentAt: new Date(), recipientCount: total },
    });
  });
}

export interface NewsletterDeliveryRunResult {
  claimed: number;
  sent: number;
  retrying: number;
  exhausted: number;
}

/**
 * Claim and deliver a bounded batch. Database leases make concurrent cron
 * calls safe; Resend's stable idempotency key protects crash recovery.
 */
export async function processPendingNewsletterDeliveries(
  limit = MAX_DELIVERIES_PER_RUN,
): Promise<NewsletterDeliveryRunResult> {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_DELIVERIES_PER_RUN);
  const claimed = await prisma.$queryRaw<Array<{ delivery_id: string; tenant_id: string }>>`
    SELECT * FROM aera_claim_newsletter_deliveries(${boundedLimit})
  `;
  let sent = 0;
  let retrying = 0;
  let exhausted = 0;
  const touchedCampaigns = new Map<string, { tenantId: string; campaignId: string }>();

  for (const ref of claimed) {
    try {
      const outcome = await withTenantContext(ref.tenant_id, async () => {
        const delivery = await prisma.newsletterDelivery.findUnique({
          where: { id: ref.delivery_id },
        });
        if (!delivery || delivery.status !== "PROCESSING") return null;
        touchedCampaigns.set(`${delivery.tenantId}:${delivery.campaignId}`, {
          tenantId: delivery.tenantId,
          campaignId: delivery.campaignId,
        });

        const attempts = delivery.attempts + 1;
        const result = await sendEmail({
          to: delivery.recipientEmail,
          subject: delivery.subject,
          html: delivery.html,
          idempotencyKey: `newsletter-${delivery.id}`,
        });
        const isExhausted = !result.ok && attempts >= MAX_ATTEMPTS;

        if (result.ok || isExhausted) {
          await createTerminalEvent({
            tenantId: delivery.tenantId,
            campaignId: delivery.campaignId,
            userId: delivery.userId,
            email: delivery.recipientEmail,
            deliveryId: delivery.id,
            type: result.ok ? "SENT" : "FAILED",
          });
        }

        const delayIndex = Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1);
        await prisma.newsletterDelivery.update({
          where: { id: delivery.id },
          data: {
            status: result.ok ? "SENT" : isExhausted ? "EXHAUSTED" : "RETRYING",
            attempts,
            lastAttemptAt: new Date(),
            sentAt: result.ok ? new Date() : null,
            leaseUntil: null,
            providerMessageId: result.id ?? null,
            error: result.ok ? null : result.error ?? "E-Mail-Versand fehlgeschlagen",
            nextAttemptAt:
              result.ok || isExhausted
                ? delivery.nextAttemptAt
                : new Date(Date.now() + RETRY_DELAYS_MS[delayIndex]!),
          },
        });
        return result.ok ? "sent" : isExhausted ? "exhausted" : "retrying";
      });
      if (outcome === "sent") sent++;
      else if (outcome === "retrying") retrying++;
      else if (outcome === "exhausted") exhausted++;
    } catch (error) {
      console.error(`Newsletter delivery failed (${ref.delivery_id}):`, error);
      // The delivery is reclaimed automatically after its database lease.
    }
  }

  for (const campaign of touchedCampaigns.values()) {
    await finalizeCampaign(campaign.tenantId, campaign.campaignId);
  }

  return { claimed: claimed.length, sent, retrying, exhausted };
}
