import "server-only";
import { randomUUID } from "node:crypto";
import prisma, { withTenantContext } from "./prisma";
import { sendEmail, renderCampaignHtml } from "./email";
import {
  appendUnsubscribeFooter,
  isNewsletterRecipientEligible,
  newsletterUnsubscribeUrls,
} from "./marketing-consent";

/**
 * Onboarding-Automationen: zeitversetzte E-Mail-Serie nach Community-Beitritt
 * (z. B. Tag 0 „Willkommen", Tag 3 „Kennst du schon…", Tag 7 „Upgrade").
 *
 * Ausführung über /api/cron/automations (externer Scheduler, z. B. Railway
 * Cron, alle fünf Minuten; nur tatsächlich fällige Zeilen werden verarbeitet).
 * Jede
 * Zustellung wird als AutomationDelivery vermerkt —
 * unique(stepId, userId) macht Läufe idempotent. Nur verifizierte Adressen.
 */

const DAY_MS = 86_400_000;
const MAX_SENDS_PER_RUN = 200;
const MAX_ATTEMPTS = 5;
const CLAIM_CHUNK_SIZE = 20;
const MIN_CLAIM_WINDOW_MS = 20_000;
const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000, 24 * 3_600_000];

/** Platzhalter: {{name}} und {{community}}. */
export function renderAutomationBody(
  body: string,
  vars: { name: string; community: string },
): string {
  return body
    .replaceAll("{{name}}", vars.name)
    .replaceAll("{{community}}", vars.community);
}

export interface AutomationRunResult {
  sent: number;
  tenants: number;
  queued: number;
  failed: number;
}

async function processClaimedDelivery(ref: {
  delivery_id: string;
  tenant_id: string;
}): Promise<boolean> {
  return withTenantContext(ref.tenant_id, async () => {
    const delivery = await prisma.automationDelivery.findUnique({
      where: { id: ref.delivery_id },
    });
    if (!delivery || delivery.status !== "PROCESSING") return false;
    const attempts = delivery.attempts + 1;
    if (!delivery.recipientEmail || !delivery.subject || !delivery.html) {
      await prisma.automationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "EXHAUSTED",
          attempts,
          lastAttemptAt: new Date(),
          leaseUntil: null,
          error: "Legacy delivery is missing its immutable email snapshot",
        },
      });
      return false;
    }
    const eligible = await isNewsletterRecipientEligible({
      tenantId: delivery.tenantId,
      userId: delivery.userId,
      email: delivery.recipientEmail,
    });
    if (!eligible || !delivery.unsubscribeUrl) {
      await prisma.automationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SUPPRESSED",
          lastAttemptAt: new Date(),
          leaseUntil: null,
          error: "Recipient has no active marketing consent or is suppressed",
        },
      });
      return false;
    }
    const result = await sendEmail({
      to: delivery.recipientEmail,
      subject: delivery.subject,
      html: delivery.html,
      idempotencyKey: `automation-${delivery.id}`,
      category: "marketing",
      unsubscribeUrl: delivery.unsubscribeUrl,
    });
    const exhausted = !result.ok && attempts >= MAX_ATTEMPTS;
    const delayIndex = Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1);
    await prisma.automationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: result.ok ? "SENT" : exhausted ? "EXHAUSTED" : "RETRYING",
        attempts,
        lastAttemptAt: new Date(),
        sentAt: result.ok ? new Date() : null,
        leaseUntil: null,
        providerMessageId: result.id ?? null,
        error: result.ok ? null : result.error ?? "E-Mail-Versand fehlgeschlagen",
        nextAttemptAt:
          result.ok || exhausted
            ? delivery.nextAttemptAt
            : new Date(Date.now() + RETRY_DELAYS_MS[delayIndex]!),
      },
    });
    return result.ok;
  });
}

export async function runAutomations(
  options: { deadlineAt?: number; limit?: number } = {},
): Promise<AutomationRunResult> {
  const now = Date.now();
  const deadlineAt = options.deadlineAt ?? now + 40_000;
  const maxSends = Math.min(
    Math.max(options.limit ?? MAX_SENDS_PER_RUN, 1),
    MAX_SENDS_PER_RUN,
  );
  let queued = 0;
  const stepRefs = await prisma.$queryRaw<Array<{ step_id: string; tenant_id: string }>>`
    SELECT * FROM aera_active_automation_steps()
  `;
  const tenantIds = new Set<string>();

  for (const ref of stepRefs) {
    // Preserve enough time for one bounded provider batch after queueing.
    if (queued >= maxSends || Date.now() >= deadlineAt - MIN_CLAIM_WINDOW_MS) break;
    tenantIds.add(ref.tenant_id);
    await withTenantContext(ref.tenant_id, async () => {
      const step = await prisma.automationStep.findUnique({
        where: { id: ref.step_id },
        include: { tenant: { select: { id: true, name: true, primaryColor: true } } },
      });
      if (!step?.isActive) return;
      const dueBefore = new Date(now - step.dayOffset * DAY_MS);
      const consents = await prisma.newsletterConsent.findMany({
        where: {
          tenantId: step.tenantId,
          status: "OPTED_IN",
          user: {
            emailVerifiedAt: { not: null },
            memberships: {
              some: {
                tenantId: step.tenantId,
                status: "ACTIVE",
                joinedAt: { lte: dueBefore },
              },
            },
            automationDeliveries: { none: { stepId: step.id } },
            emailSuppressions: {
              none: { tenantId: step.tenantId, liftedAt: null },
            },
          },
        },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: [{ optedInAt: "asc" }, { id: "asc" }],
        take: maxSends - queued,
      });
      for (const consent of consents) {
        if (queued >= maxSends) break;
        if (consent.email.trim().toLowerCase() !== consent.user.email.trim().toLowerCase()) continue;
        const vars = { name: consent.user.name, community: step.tenant.name };
        const subject = renderAutomationBody(step.subject, vars);
        const deliveryId = randomUUID();
        const unsubscribe = newsletterUnsubscribeUrls({
          deliveryId,
          tenantId: step.tenantId,
          userId: consent.user.id,
          kind: "automation",
        });
        const html = appendUnsubscribeFooter(renderCampaignHtml({
          tenantName: step.tenant.name,
          primaryColor: step.tenant.primaryColor,
          subject,
          body: renderAutomationBody(step.body, vars),
        }), unsubscribe.pageUrl);
        try {
          await prisma.automationDelivery.create({
            data: {
              id: deliveryId,
              tenantId: step.tenantId,
              stepId: step.id,
              userId: consent.user.id,
              recipientEmail: consent.user.email,
              subject,
              html,
              unsubscribeUrl: unsubscribe.apiUrl,
            },
          });
          queued++;
        } catch (error) {
          if ((error as { code?: string }).code !== "P2002") throw error;
        }
      }
    });
  }

  let sent = 0;
  let failed = 0;
  let claimedCount = 0;
  while (
    claimedCount < maxSends &&
    Date.now() < deadlineAt - MIN_CLAIM_WINDOW_MS
  ) {
    const chunkLimit = Math.min(CLAIM_CHUNK_SIZE, maxSends - claimedCount);
    const claimed =
      (await prisma.$queryRaw<Array<{ delivery_id: string; tenant_id: string }>>`
        SELECT * FROM aera_claim_automation_deliveries(${chunkLimit})
      `) ?? [];
    if (claimed.length === 0) break;
    claimedCount += claimed.length;
    const outcomes = await Promise.all(
      claimed.map(async (ref) => {
        try {
          return await processClaimedDelivery(ref);
        } catch (error) {
          console.error(`Automation delivery failed (${ref.delivery_id}):`, error);
          return false;
        }
      }),
    );
    for (const success of outcomes) {
      if (success) sent++;
      else failed++;
    }
    if (claimed.length < chunkLimit) break;
  }

  return { sent, tenants: tenantIds.size, queued, failed };
}
