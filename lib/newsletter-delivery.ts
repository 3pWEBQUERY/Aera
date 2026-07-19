import "server-only";
import { randomUUID } from "node:crypto";
import prisma, { systemPrisma, withTenantContext } from "./prisma";
import { renderCampaignHtml, sendEmail } from "./email";
import {
  appendUnsubscribeFooter,
  isNewsletterRecipientEligible,
  newsletterUnsubscribeUrls,
} from "./marketing-consent";

const MAX_ATTEMPTS = 5;
const MAX_DELIVERIES_PER_RUN = 200;
const DELIVERY_CLAIM_CHUNK = 20;
const MIN_DELIVERY_WINDOW_MS = 20_000;
const CAMPAIGN_BATCH_SIZE = 500;
const CAMPAIGN_BATCHES_PER_RUN = 4;
const MAX_CAMPAIGNS_PER_RUN = 20;
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
  unsubscribeLabel?: string;
}

/** Persist the complete recipient snapshot before any provider call happens. */
export async function queueNewsletterCampaign(input: QueueNewsletterInput): Promise<number> {
  if (input.recipients.length === 0) return 0;
  const result = await prisma.newsletterDelivery.createMany({
    data: input.recipients.map((recipient) => {
      const id = randomUUID();
      const unsubscribe = newsletterUnsubscribeUrls({
        deliveryId: id,
        tenantId: input.tenantId,
        userId: recipient.id,
        kind: "newsletter",
      });
      return {
        id,
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        userId: recipient.id,
        recipientEmail: recipient.email.trim().toLowerCase(),
        subject: input.subject,
        html: appendUnsubscribeFooter(
          input.html,
          unsubscribe.pageUrl,
          input.unsubscribeLabel,
        ),
        unsubscribeUrl: unsubscribe.apiUrl,
      };
    }),
    skipDuplicates: true,
  });
  return result.count;
}

export type DispatchableNewsletterCampaign = {
  id: string;
  tenantId: string;
  subject: string;
  body: string;
  segmentId: string | null;
  status: "SCHEDULED" | "SENDING";
  scheduledAt: Date | null;
  tenant: { name: string; primaryColor: string };
  footerLabel?: string;
};

interface AudienceRules {
  tierSlug?: string;
  minPoints?: number;
}

export async function queueNewsletterAudienceBatch(
  campaign: DispatchableNewsletterCampaign,
): Promise<{ queued: number; total: number; hasMore: boolean }> {
  let rules: AudienceRules = {};
  if (campaign.segmentId) {
    const segment = await prisma.segment.findFirst({
      where: { id: campaign.segmentId, tenantId: campaign.tenantId },
      select: { rules: true },
    });
    rules = (segment?.rules ?? {}) as AudienceRules;
  }
  const minPoints =
    Number.isFinite(rules.minPoints) && (rules.minPoints ?? 0) > 0
      ? Math.floor(rules.minPoints!)
      : null;
  const candidates = await prisma.newsletterConsent.findMany({
    where: {
      tenantId: campaign.tenantId,
      status: "OPTED_IN",
      user: {
        emailVerifiedAt: { not: null },
        memberships: {
          some: {
            tenantId: campaign.tenantId,
            status: "ACTIVE",
            ...(rules.tierSlug ? { tier: { slug: rules.tierSlug } } : {}),
          },
        },
        newsletterDeliveries: { none: { campaignId: campaign.id } },
        emailSuppressions: {
          none: { tenantId: campaign.tenantId, liftedAt: null },
        },
        ...(minPoints !== null
          ? {
              memberStats: {
                some: { tenantId: campaign.tenantId, points: { gte: minPoints } },
              },
            }
          : {}),
      },
    },
    orderBy: [{ optedInAt: "asc" }, { id: "asc" }],
    take: CAMPAIGN_BATCH_SIZE + 1,
    select: { email: true, user: { select: { id: true, email: true } } },
  });
  const recipients = candidates
    .slice(0, CAMPAIGN_BATCH_SIZE)
    .filter((consent) => consent.email.trim().toLowerCase() === consent.user.email.trim().toLowerCase())
    .map((consent) => consent.user);
  const html = renderCampaignHtml({
    tenantName: campaign.tenant.name,
    primaryColor: campaign.tenant.primaryColor,
    subject: campaign.subject,
    body: campaign.body,
    footerLabel: campaign.footerLabel ?? "Aera",
  });
  const queued = await queueNewsletterCampaign({
    tenantId: campaign.tenantId,
    campaignId: campaign.id,
    subject: campaign.subject,
    html,
    recipients,
    unsubscribeLabel: "Unsubscribe",
  });
  const total = await prisma.newsletterDelivery.count({
    where: { campaignId: campaign.id },
  });
  const hasMore = candidates.length > CAMPAIGN_BATCH_SIZE;
  let completed = false;
  if (!hasMore) {
    const active = await prisma.newsletterDelivery.count({
      where: {
        campaignId: campaign.id,
        status: { in: ["PENDING", "PROCESSING", "RETRYING"] },
      },
    });
    completed = active === 0;
  }
  await prisma.newsletterCampaign.updateMany({
    where: { id: campaign.id, tenantId: campaign.tenantId, status: "SENDING" },
    data: {
      recipientCount: total,
      ...(completed ? { status: "SENT", sentAt: new Date() } : {}),
    },
  });
  return { queued, total, hasMore };
}

export interface NewsletterCampaignDispatchResult {
  claimed: number;
  queued: number;
  completed: number;
  failed: number;
}

/**
 * Turn due SCHEDULED campaigns into durable delivery rows in bounded pages.
 * SENDING campaigns are revisited as crash recovery, including immediate
 * sends that were interrupted while snapshotting a large audience.
 */
export async function dispatchNewsletterCampaigns(
  options: { deadlineAt?: number; now?: Date; limit?: number } = {},
): Promise<NewsletterCampaignDispatchResult> {
  const now = options.now ?? new Date();
  const deadlineAt = options.deadlineAt ?? Date.now() + 40_000;
  const campaigns = await systemPrisma.newsletterCampaign.findMany({
    where: {
      tenant: { status: "ACTIVE" },
      OR: [
        { status: "SCHEDULED", scheduledAt: { not: null, lte: now } },
        { status: "SENDING" },
      ],
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: Math.min(Math.max(options.limit ?? MAX_CAMPAIGNS_PER_RUN, 1), 50),
    select: {
      id: true,
      tenantId: true,
      subject: true,
      body: true,
      segmentId: true,
      status: true,
      scheduledAt: true,
      tenant: { select: { name: true, primaryColor: true } },
    },
  });

  let claimed = 0;
  let queued = 0;
  let completed = 0;
  let failed = 0;
  for (const campaign of campaigns as DispatchableNewsletterCampaign[]) {
    if (Date.now() >= deadlineAt - 3_000) break;
    try {
      await withTenantContext(campaign.tenantId, async () => {
        if (campaign.status === "SCHEDULED") {
          const transition = await prisma.newsletterCampaign.updateMany({
            where: {
              id: campaign.id,
              tenantId: campaign.tenantId,
              status: "SCHEDULED",
              scheduledAt: { not: null, lte: now },
            },
            data: { status: "SENDING" },
          });
          if (transition.count !== 1) return;
        }
        claimed++;
        const sendingCampaign = { ...campaign, status: "SENDING" as const };
        for (let batch = 0; batch < CAMPAIGN_BATCHES_PER_RUN; batch++) {
          if (Date.now() >= deadlineAt - 3_000) break;
          const result = await queueNewsletterAudienceBatch(sendingCampaign);
          queued += result.queued;
          if (!result.hasMore) {
            completed++;
            break;
          }
        }
      });
    } catch (error) {
      failed++;
      console.error(`Newsletter audience queue failed (${campaign.id}):`, error);
      // The campaign remains SENDING and is resumed idempotently next minute.
    }
  }
  return { claimed, queued, completed, failed };
}

async function createTerminalEvent(input: {
  tenantId: string;
  campaignId: string;
  userId: string;
  email: string;
  deliveryId: string;
  type: "SENT" | "FAILED" | "SUPPRESSED";
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
  suppressed: number;
  exhausted: number;
}

/**
 * Claim and deliver a bounded batch. Database leases make concurrent cron
 * calls safe; Resend's stable idempotency key protects crash recovery.
 */
export async function processPendingNewsletterDeliveries(
  limit = MAX_DELIVERIES_PER_RUN,
  options: { deadlineAt?: number } = {},
): Promise<NewsletterDeliveryRunResult> {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_DELIVERIES_PER_RUN);
  const deadlineAt = options.deadlineAt ?? Date.now() + 40_000;
  let claimedCount = 0;
  let sent = 0;
  let retrying = 0;
  let suppressed = 0;
  let exhausted = 0;
  const touchedCampaigns = new Map<string, { tenantId: string; campaignId: string }>();

  while (
    claimedCount < boundedLimit &&
    Date.now() < deadlineAt - MIN_DELIVERY_WINDOW_MS
  ) {
    const chunkLimit = Math.min(DELIVERY_CLAIM_CHUNK, boundedLimit - claimedCount);
    const claimed =
      (await prisma.$queryRaw<Array<{ delivery_id: string; tenant_id: string }>>`
        SELECT * FROM aera_claim_newsletter_deliveries(${chunkLimit})
      `) ?? [];
    if (claimed.length === 0) break;
    claimedCount += claimed.length;
    await Promise.all(claimed.map(async (ref) => {
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
        const eligible = await isNewsletterRecipientEligible({
          tenantId: delivery.tenantId,
          userId: delivery.userId,
          email: delivery.recipientEmail,
        });
        if (!eligible || !delivery.unsubscribeUrl) {
          await createTerminalEvent({
            tenantId: delivery.tenantId,
            campaignId: delivery.campaignId,
            userId: delivery.userId,
            email: delivery.recipientEmail,
            deliveryId: delivery.id,
            type: "SUPPRESSED",
          });
          await prisma.newsletterDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "SUPPRESSED",
              lastAttemptAt: new Date(),
              leaseUntil: null,
              error: "Recipient has no active marketing consent or is suppressed",
            },
          });
          return "suppressed";
        }
        const result = await sendEmail({
          to: delivery.recipientEmail,
          subject: delivery.subject,
          html: delivery.html,
          idempotencyKey: `newsletter-${delivery.id}`,
          category: "marketing",
          unsubscribeUrl: delivery.unsubscribeUrl,
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
        else if (outcome === "suppressed") suppressed++;
        else if (outcome === "exhausted") exhausted++;
      } catch (error) {
        console.error(`Newsletter delivery failed (${ref.delivery_id}):`, error);
        // The bounded chunk completes inside its lease; a crashed row is
        // reclaimed automatically once that lease expires.
      }
    }));
    if (claimed.length < chunkLimit) break;
  }

  for (const campaign of touchedCampaigns.values()) {
    await finalizeCampaign(campaign.tenantId, campaign.campaignId);
  }

  return { claimed: claimedCount, sent, retrying, suppressed, exhausted };
}
