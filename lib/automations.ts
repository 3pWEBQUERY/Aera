import "server-only";
import prisma, { withTenantContext } from "./prisma";
import { sendEmail, renderCampaignHtml } from "./email";

/**
 * Onboarding-Automationen: zeitversetzte E-Mail-Serie nach Community-Beitritt
 * (z. B. Tag 0 „Willkommen", Tag 3 „Kennst du schon…", Tag 7 „Upgrade").
 *
 * Ausführung über /api/cron/automations (externer Scheduler, z. B. Railway
 * Cron, stündlich). Jede Zustellung wird als AutomationDelivery vermerkt —
 * unique(stepId, userId) macht Läufe idempotent. Nur verifizierte Adressen.
 */

const DAY_MS = 86_400_000;
const MAX_SENDS_PER_RUN = 200;
const MAX_ATTEMPTS = 5;
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

export async function runAutomations(): Promise<AutomationRunResult> {
  const now = Date.now();
  let queued = 0;
  const stepRefs = await prisma.$queryRaw<Array<{ step_id: string; tenant_id: string }>>`
    SELECT * FROM aera_active_automation_steps()
  `;
  const tenantIds = new Set(stepRefs.map((step) => step.tenant_id));

  for (const ref of stepRefs) {
    if (queued >= MAX_SENDS_PER_RUN) break;
    await withTenantContext(ref.tenant_id, async () => {
      const step = await prisma.automationStep.findUnique({
        where: { id: ref.step_id },
        include: { tenant: { select: { id: true, name: true, primaryColor: true } } },
      });
      if (!step?.isActive) return;
      const dueBefore = new Date(now - step.dayOffset * DAY_MS);
      const memberships = await prisma.membership.findMany({
        where: {
          tenantId: step.tenantId,
          status: "ACTIVE",
          joinedAt: { lte: dueBefore },
          user: {
            emailVerifiedAt: { not: null },
            automationDeliveries: { none: { stepId: step.id } },
          },
        },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: "asc" },
        take: MAX_SENDS_PER_RUN - queued,
      });
      for (const membership of memberships) {
        if (queued >= MAX_SENDS_PER_RUN) break;
        const vars = { name: membership.user.name, community: step.tenant.name };
        const subject = renderAutomationBody(step.subject, vars);
        const html = renderCampaignHtml({
          tenantName: step.tenant.name,
          primaryColor: step.tenant.primaryColor,
          subject,
          body: renderAutomationBody(step.body, vars),
        });
        try {
          await prisma.automationDelivery.create({
            data: {
              tenantId: step.tenantId,
              stepId: step.id,
              userId: membership.userId,
              recipientEmail: membership.user.email,
              subject,
              html,
            },
          });
          queued++;
        } catch (error) {
          if ((error as { code?: string }).code !== "P2002") throw error;
        }
      }
    });
  }

  const claimed = await prisma.$queryRaw<Array<{ delivery_id: string; tenant_id: string }>>`
    SELECT * FROM aera_claim_automation_deliveries(${MAX_SENDS_PER_RUN})
  `;
  let sent = 0;
  let failed = 0;
  for (const ref of claimed) {
    try {
      const ok = await withTenantContext(ref.tenant_id, async () => {
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
        const result = await sendEmail({
          to: delivery.recipientEmail,
          subject: delivery.subject,
          html: delivery.html,
          idempotencyKey: `automation-${delivery.id}`,
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
      if (ok) sent++;
      else failed++;
    } catch (error) {
      failed++;
      console.error(`Automation delivery failed (${ref.delivery_id}):`, error);
      // A crashed attempt is reclaimed after its five-minute database lease.
    }
  }

  return { sent, tenants: tenantIds.size, queued, failed };
}
