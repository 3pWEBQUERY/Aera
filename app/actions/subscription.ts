"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import prisma, { setTenantContext, withTenantTransaction } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getErrorTranslator } from "@/lib/action-errors";
import {
  assertStripeSubscriptionsInactive,
  cancelMembershipStripeSubscription,
} from "@/lib/stripe-cleanup";
import type { ActionState } from "./dashboard";

async function ownMembership(slug: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return null;
  setTenantContext(tenant.id);
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    include: { tier: true },
  });
  if (!membership) return null;
  return { user, tenant, membership };
}

function revalidateAll(slug: string) {
  revalidatePath(`/dashboard/${slug}`, "layout");
  revalidatePath(`/c/${slug}`, "layout");
}

/**
 * Cancel the current user's own paid membership.
 * - With Stripe: flags the subscription to end at period end; access stays
 *   until then (entitlement gets an expiry).
 * - Without Stripe (dev grants): ends immediately and falls back to the
 *   free default tier.
 */
export async function cancelOwnMembershipAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const t = await getErrorTranslator();
  const own = await ownMembership(slug);
  if (!own) return { error: t("membershipNotFound") };
  const { user, tenant, membership } = own;

  if (membership.role === "OWNER")
    return { error: t("ownerCantCancel") };
  if (!membership.tier || membership.tier.priceCents === 0)
    return { error: t("noPaidMembership") };
  const paidTierKey = membership.tier.entitlementKey;

  const stripeSubscriptions = await prisma.subscription.findMany({
    where: {
      tenantId: tenant.id,
      userId: user.id,
      stripeSubscriptionId: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });

  if (stripeSubscriptions.length > 0) {
    const paidPeriodEnds: Date[] = [];
    let scheduledCount = 0;
    let immediateCount = 0;

    // Historical duplicate rows are possible. Every Stripe id must be handled;
    // canceling only the newest row could leave an older contract charging.
    for (const sub of stripeSubscriptions) {
      const stripeSubscriptionId = sub.stripeSubscriptionId!;
      let cancellation;
      try {
        cancellation = await cancelMembershipStripeSubscription(stripeSubscriptionId);
      } catch {
        await writeAudit({
          tenantId: tenant.id,
          actorUserId: user.id,
          action: "membership.cancel.failed",
          targetType: "Subscription",
          targetId: sub.id,
          metadata: {
            reason: "stripe_cleanup_failed",
            completedBeforeFailure:
              scheduledCount + immediateCount,
            totalStripeSubscriptions: stripeSubscriptions.length,
          },
        });
        return { error: t("stripeCancelFailed") };
      }

      if (cancellation.mode === "period_end") {
        scheduledCount += 1;
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            cancelAtPeriodEnd: true,
            currentPeriodEnd: cancellation.currentPeriodEnd ?? sub.currentPeriodEnd,
          },
        });
        if (cancellation.currentPeriodEnd) {
          paidPeriodEnds.push(cancellation.currentPeriodEnd);
        }
      } else {
        immediateCount += 1;
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "CANCELED", cancelAtPeriodEnd: false },
        });
      }
    }

    if (scheduledCount > 0) {
      // Multiple accidentally active subscriptions may have different paid
      // periods. Keep access until the latest period that Stripe confirmed.
      if (paidPeriodEnds.length > 0) {
        const expiresAt = new Date(Math.max(...paidPeriodEnds.map((date) => date.getTime())));
        await prisma.entitlement.updateMany({
          where: {
            tenantId: tenant.id,
            userId: user.id,
            key: paidTierKey,
          },
          data: { expiresAt },
        });
      }
    } else {
      // All remote contracts were already terminal or were recovery-state
      // subscriptions canceled immediately. Revoke recurring tier access now.
      const defaultTier = await prisma.membershipTier.findFirst({
        where: { tenantId: tenant.id, isDefault: true },
      });
      await withTenantTransaction(async (tx) => {
        await tx.entitlement.deleteMany({
          where: {
            tenantId: tenant.id,
            userId: user.id,
            key: paidTierKey,
            source: { in: ["TIER", "ROLE"] },
          },
        });
        await tx.membership.update({
          where: { id: membership.id },
          data: { tierId: defaultTier?.id ?? null },
        });
      });
    }
  } else {
    // No Stripe subscription (dev grant): end immediately.
    const sub = await prisma.subscription.findFirst({
      where: { tenantId: tenant.id, userId: user.id, status: { not: "CANCELED" } },
      orderBy: { createdAt: "desc" },
    });
    if (sub) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "CANCELED", cancelAtPeriodEnd: false },
      });
    }
    await prisma.entitlement.deleteMany({
      where: {
        tenantId: tenant.id,
        userId: user.id,
        key: membership.tier.entitlementKey,
        source: { in: ["TIER", "ROLE"] },
      },
    });
    const defaultTier = await prisma.membershipTier.findFirst({
      where: { tenantId: tenant.id, isDefault: true },
    });
    await prisma.membership.update({
      where: { id: membership.id },
      data: { tierId: defaultTier?.id ?? null },
    });
  }

  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "membership.cancel",
    metadata: {
      tier: membership.tier.slug,
      stripeSubscriptions: stripeSubscriptions.length,
    },
  });
  revalidateAll(slug);
  return { ok: true };
}

/** Leave the community entirely (non-owners; purchases stay untouched). */
export async function leaveOwnCommunityAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const own = await ownMembership(slug);
  if (!own) return;
  const { user, tenant, membership } = own;
  if (membership.role === "OWNER") return;

  // Never remove the local membership while Stripe can still charge it. The
  // member must cancel first and wait until Stripe confirms the subscription
  // has ended. This also covers trials, payment-recovery and period-end cancels.
  const stripeSubscriptions = await prisma.subscription.findMany({
    where: {
      tenantId: tenant.id,
      userId: user.id,
      stripeSubscriptionId: { not: null },
    },
    select: { stripeSubscriptionId: true },
  });
  try {
    await assertStripeSubscriptionsInactive(
      stripeSubscriptions.map((subscription) => subscription.stripeSubscriptionId),
    );
  } catch {
    await writeAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "membership.leave.blocked",
      metadata: { reason: "stripe_subscription_not_terminal" },
    });
    return;
  }

  await prisma.subscription.updateMany({
    where: { tenantId: tenant.id, userId: user.id, status: "ACTIVE" },
    data: { status: "CANCELED" },
  });
  // Only tier/role grants — bought products (PURCHASE) stay with the user.
  await prisma.entitlement.deleteMany({
    where: { tenantId: tenant.id, userId: user.id, source: { in: ["TIER", "ROLE"] } },
  });
  await prisma.membership.delete({ where: { id: membership.id } });

  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "membership.leave",
  });
  revalidateAll(slug);
  redirect(`/c/${slug}`);
}
