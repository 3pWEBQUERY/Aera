"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { createConnectAccount, createOnboardingLink } from "@/lib/stripe";

/**
 * Start (or resume) Stripe Connect onboarding: ensure the tenant has an Express
 * account, then redirect the creator to Stripe's hosted onboarding.
 */
export async function startStripeConnectAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const base = `${env.APP_URL}/dashboard/${slug}/settings?tab=integrations`;

  let accountId = tenant.stripeAccountId;
  if (!accountId) {
    const user = await getCurrentUser();
    accountId = await createConnectAccount(user?.email ?? "");
    if (!accountId) redirect(`${base}&connect=error`);
    await prisma.tenant.update({
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

/** Detach the connected account (payments fall back to the platform account). */
export async function disconnectStripeAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { stripeAccountId: null },
  });
  revalidatePath(`/dashboard/${slug}/settings`);
}
