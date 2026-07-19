"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import prisma, { systemPrisma } from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { createConnectAccount, createOnboardingLink } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import {
  assertStripeSubscriptionsInactive,
  deleteStripeConnectAccount,
} from "@/lib/stripe-cleanup";

/**
 * Start (or resume) Stripe Connect onboarding: ensure the tenant has an Express
 * account, then redirect the creator to Stripe's hosted onboarding.
 */
export async function startStripeConnectAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug, "OWNER");
  const base = `${env.APP_URL}/dashboard/${slug}/settings?tab=integrations`;

  let accountId = tenant.stripeAccountId;
  if (!accountId) {
    const user = await getCurrentUser();
    accountId = await createConnectAccount(user?.email ?? "");
    if (!accountId) redirect(`${base}&connect=error`);
    await systemPrisma.tenant.update({
      where: { id: tenant.id },
      data: { stripeAccountId: accountId },
    });
  }

  const url = await createOnboardingLink(
    accountId!,
    `${base}&connect=refresh`,
    `${base}&connect=done`,
  );
  if (!url) redirect(`${base}&connect=error`);
  redirect(url!);
}

/** Remove the external Connect relationship before clearing the local reference. */
export async function disconnectStripeAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug, "OWNER");
  if (!tenant.stripeAccountId) return;

  const [subscriptions, pendingOrders] = await Promise.all([
    prisma.subscription.findMany({
      where: { tenantId: tenant.id, stripeSubscriptionId: { not: null } },
      select: { stripeSubscriptionId: true },
    }),
    prisma.order.count({ where: { tenantId: tenant.id, status: "PENDING" } }),
  ]);
  let cleanupFailed = false;
  try {
    if (pendingOrders > 0) {
      throw new Error("Pending product payments must finish before disconnect");
    }
    await assertStripeSubscriptionsInactive(
      subscriptions.map((subscription) => subscription.stripeSubscriptionId),
    );
    await deleteStripeConnectAccount(tenant.stripeAccountId);
  } catch {
    cleanupFailed = true;
    await writeAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "tenant.stripe.disconnect.blocked",
      metadata: {
        reason: pendingOrders > 0 ? "pending_payments" : "external_cleanup_failed",
        pendingOrders,
      },
    });
  }
  if (cleanupFailed) {
    redirect(`/dashboard/${slug}/settings?tab=integrations&connect=disconnect-blocked`);
  }

  await systemPrisma.tenant.update({
    where: { id: tenant.id },
    data: { stripeAccountId: null },
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "tenant.stripe.disconnect",
  });
  revalidatePath(`/dashboard/${slug}/settings`);
}
