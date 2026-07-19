import "server-only";

import type { CreatorPlan } from "@/app/generated/prisma/client";
import type { PlanInfo } from "@/lib/credit-plans";
import prisma, { withTenantContext } from "@/lib/prisma";
import {
  cancelAndRefundOrphanCreatorSubscription,
  createCreatorPlanCheckoutSession,
  expireCreatorPlanCheckoutSession,
  retrieveCreatorPlanCheckoutSession,
  type CreatorBillingTenant,
} from "@/lib/stripe";

const ACTIVE_STATUSES = ["CREATING", "OPEN"] as const;
const CREATING_TTL_MS = 25 * 60 * 60 * 1000;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function closeStaleCreatorCheckouts(tenantId: string, now: Date): Promise<void> {
  const stale = await prisma.pendingCreatorCheckout.findMany({
    where: {
      tenantId,
      status: { in: [...ACTIVE_STATUSES] },
      expiresAt: { lte: now },
    },
    select: { id: true, status: true, stripeSessionId: true },
  });
  for (const intent of stale) {
    // A timed-out Stripe request is ambiguous when no Session id was attached.
    // Keep CREATING fail-closed until an explicit retry/reconciliation proves
    // whether Stripe created anything.
    if (!intent.stripeSessionId) continue;
    const session = await retrieveCreatorPlanCheckoutSession(intent.stripeSessionId);
    if (!session) {
      await prisma.pendingCreatorCheckout.updateMany({
        where: { id: intent.id, tenantId, status: { in: [...ACTIVE_STATUSES] } },
        data: { status: "FAILED" },
      });
    } else if (session.status === "expired") {
      await prisma.pendingCreatorCheckout.updateMany({
        where: { id: intent.id, tenantId, status: { in: [...ACTIVE_STATUSES] } },
        data: { status: "EXPIRED", expiresAt: session.expiresAt },
      });
    } else {
      // In particular, a completed Session whose webhook is delayed must stay a
      // deletion blocker; treating its timestamp as proof of expiry could orphan
      // an already paid subscription.
      await prisma.pendingCreatorCheckout.updateMany({
        where: { id: intent.id, tenantId, status: { in: [...ACTIVE_STATUSES] } },
        data: { expiresAt: session.expiresAt },
      });
    }
  }
}

async function activeCreatorCheckout(tenantId: string) {
  return prisma.pendingCreatorCheckout.findFirst({
    where: { tenantId, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Create or resume the one durable creator-plan checkout allowed per tenant.
 * The database row is committed before Stripe can accept money; its id is also
 * the Stripe idempotency key and is copied into Session/subscription metadata.
 */
export async function startTrackedCreatorPlanCheckout(args: {
  tenant: CreatorBillingTenant;
  user: { id: string; email: string };
  plan: PlanInfo;
  stripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<string | null> {
  return withTenantContext(args.tenant.id, async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const now = new Date();
      await closeStaleCreatorCheckouts(args.tenant.id, now);

      let intent = await activeCreatorCheckout(args.tenant.id);
      if (
        intent &&
        (intent.plan !== args.plan.key || intent.userId !== args.user.id)
      ) {
        return null;
      }
      if (!intent) {
        try {
          intent = await prisma.pendingCreatorCheckout.create({
            data: {
              tenantId: args.tenant.id,
              userId: args.user.id,
              plan: args.plan.key as CreatorPlan,
              status: "CREATING",
              expiresAt: new Date(now.getTime() + CREATING_TTL_MS),
            },
          });
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          intent = await activeCreatorCheckout(args.tenant.id);
          if (
            !intent ||
            intent.plan !== args.plan.key ||
            intent.userId !== args.user.id
          ) {
            return null;
          }
        }
      }

      if (
        intent.status === "CREATING" &&
        !intent.stripeSessionId &&
        intent.expiresAt <= now
      ) {
        return null;
      }

      if (intent.stripeSessionId) {
        const current = await retrieveCreatorPlanCheckoutSession(intent.stripeSessionId);
        if (!current) {
          await prisma.pendingCreatorCheckout.updateMany({
            where: { id: intent.id, tenantId: args.tenant.id, status: { in: [...ACTIVE_STATUSES] } },
            data: { status: "FAILED" },
          });
          continue;
        }
        await prisma.pendingCreatorCheckout.updateMany({
          where: { id: intent.id, tenantId: args.tenant.id, status: { in: [...ACTIVE_STATUSES] } },
          data: { expiresAt: current.expiresAt },
        });
        if (current.status === "expired") {
          await prisma.pendingCreatorCheckout.updateMany({
            where: { id: intent.id, tenantId: args.tenant.id, status: { in: [...ACTIVE_STATUSES] } },
            data: { status: "EXPIRED" },
          });
          continue;
        }
        // A complete Session remains deletion-blocking until its signed webhook
        // associates the subscription and marks the intent COMPLETED.
        return current.url;
      }

      const session = await createCreatorPlanCheckoutSession({
        tenant: args.tenant,
        user: args.user,
        plan: args.plan,
        stripeCustomerId: args.stripeCustomerId,
        successUrl: args.successUrl,
        cancelUrl: args.cancelUrl,
        pendingCreatorCheckoutId: intent.id,
        idempotencyKey: `aera:creator-checkout:${intent.id}`,
      });
      if (!session) {
        await prisma.pendingCreatorCheckout.updateMany({
          where: { id: intent.id, tenantId: args.tenant.id, status: { in: [...ACTIVE_STATUSES] } },
          data: { status: "FAILED" },
        });
        return null;
      }

      let attached = 0;
      try {
        const result = await prisma.pendingCreatorCheckout.updateMany({
          where: { id: intent.id, tenantId: args.tenant.id, status: { in: [...ACTIVE_STATUSES] } },
          data: {
            status: "OPEN",
            stripeSessionId: session.id,
            expiresAt: session.expiresAt,
          },
        });
        attached = result.count;
      } catch (error) {
        await abandonUntrackedCreatorSession(session.id);
        throw error;
      }
      if (attached === 1) return session.url;

      const completed = await prisma.pendingCreatorCheckout.findFirst({
        where: { id: intent.id, tenantId: args.tenant.id, status: "COMPLETED" },
        select: { id: true },
      });
      if (completed) return session.url;
      await abandonUntrackedCreatorSession(session.id);
      return null;
    }
    return null;
  });
}

async function abandonUntrackedCreatorSession(stripeSessionId: string): Promise<void> {
  const session = await expireCreatorPlanCheckoutSession(stripeSessionId);
  if (session?.status !== "complete") return;
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  if (stripeSubscriptionId) {
    await cancelAndRefundOrphanCreatorSubscription({ stripeSubscriptionId });
  }
}

/** Signed Stripe completion associates the durable intent with its subscription. */
export async function completeTrackedCreatorCheckout(args: {
  pendingCreatorCheckoutId?: string;
  tenantId: string;
  userId: string;
  plan: CreatorPlan;
  stripeSessionId: string;
  stripeSubscriptionId: string;
}): Promise<void> {
  if (!args.pendingCreatorCheckoutId) return;
  await withTenantContext(args.tenantId, async () => {
    await prisma.pendingCreatorCheckout.updateMany({
      where: {
        id: args.pendingCreatorCheckoutId,
        tenantId: args.tenantId,
        userId: args.userId,
        plan: args.plan,
      },
      data: {
        status: "COMPLETED",
        stripeSessionId: args.stripeSessionId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        completedAt: new Date(),
      },
    });
  });
}

/** Expiry/async failure releases the deletion barrier but preserves history. */
export async function failTrackedCreatorCheckout(args: {
  pendingCreatorCheckoutId?: string;
  tenantId: string;
  stripeSessionId: string;
  status: "EXPIRED" | "FAILED";
}): Promise<void> {
  await withTenantContext(args.tenantId, async () => {
    await prisma.pendingCreatorCheckout.updateMany({
      where: {
        tenantId: args.tenantId,
        status: { in: [...ACTIVE_STATUSES] },
        OR: [
          ...(args.pendingCreatorCheckoutId ? [{ id: args.pendingCreatorCheckoutId }] : []),
          { stripeSessionId: args.stripeSessionId },
        ],
      },
      data: { status: args.status, stripeSessionId: args.stripeSessionId },
    });
  });
}

/** Open creator sessions block tenant deletion even before wallet association. */
export async function countOpenCreatorCheckouts(tenantId: string): Promise<number> {
  return withTenantContext(tenantId, async () => {
    await closeStaleCreatorCheckouts(tenantId, new Date());
    return prisma.pendingCreatorCheckout.count({
      where: { tenantId, status: { in: [...ACTIVE_STATUSES] } },
    });
  });
}
