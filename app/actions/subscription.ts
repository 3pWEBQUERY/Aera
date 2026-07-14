"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { features } from "@/lib/env";
import { cancelSubscriptionAtPeriodEnd } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import { getErrorTranslator } from "@/lib/action-errors";
import type { ActionState } from "./dashboard";

async function ownMembership(slug: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return null;
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

  const sub = await prisma.subscription.findFirst({
    where: { tenantId: tenant.id, userId: user.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  if (sub?.stripeSubscriptionId && features.stripe) {
    // Graceful cancellation at period end via Stripe.
    let periodEnd: Date | null = null;
    try {
      periodEnd = await cancelSubscriptionAtPeriodEnd(sub.stripeSubscriptionId);
    } catch {
      return { error: t("stripeCancelFailed") };
    }
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: periodEnd ?? sub.currentPeriodEnd,
      },
    });
    // Access expires with the paid period.
    if (periodEnd) {
      await prisma.entitlement.updateMany({
        where: { tenantId: tenant.id, userId: user.id, key: membership.tier.entitlementKey },
        data: { expiresAt: periodEnd },
      });
    }
  } else {
    // No Stripe subscription (dev grant): end immediately.
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
    metadata: { tier: membership.tier.slug },
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
  const liveStripeSubscription = await prisma.subscription.findFirst({
    where: {
      tenantId: tenant.id,
      userId: user.id,
      stripeSubscriptionId: { not: null },
      status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
    },
    select: { id: true },
  });
  if (liveStripeSubscription) return;

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
