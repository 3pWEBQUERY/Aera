"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import prisma, { setTenantContext } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireTenantAdmin } from "@/lib/guards";
import { env, features } from "@/lib/env";
import { createTipCheckout, platformFeeCents } from "@/lib/stripe";
import { awardPoints } from "@/lib/gamification";

export interface ActionState {
  ok?: boolean;
  error?: string;
}
const ok: ActionState = { ok: true };
const devPaymentFallbackAllowed = process.env.NODE_ENV !== "production";
const MIN_TIP_CENTS = 100;
const MAX_TIP_CENTS = 100_000;

async function tenantBySlug(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (tenant) setTenantContext(tenant.id);
  return tenant;
}

/** Member sends a tip of an arbitrary amount. */
export async function tipAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceSlug = String(fd.get("space") || "");
  const back = spaceSlug ? `/c/${slug}/s/${spaceSlug}` : `/c/${slug}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;

  const space = await prisma.space.findFirst({
    where: { tenantId: tenant.id, slug: spaceSlug, type: "TIPS" },
  });
  if (!space) redirect(back);

  const euro = parseFloat(String(fd.get("amount") || "").replace(",", "."));
  const amountCents = Math.round((Number.isFinite(euro) ? euro : 0) * 100);
  if (amountCents < MIN_TIP_CENTS || amountCents > MAX_TIP_CENTS) redirect(`${back}?error=amount`);
  const message = String(fd.get("message") || "").trim().slice(0, 280) || null;
  const isPublic = fd.get("isPublic") !== "false";

  const tip = await prisma.tip.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      userId: user!.id,
      amountCents,
      message,
      isPublic,
      status: "PENDING",
    },
  });

  if (features.stripe) {
    const url = await createTipCheckout({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        platformFeePercent: tenant.platformFeePercent,
        stripeAccountId: tenant.stripeAccountId,
      },
      tip: { id: tip.id, amountCents, currency: tip.currency, label: `Trinkgeld · ${tenant.name}` },
      user: { id: user!.id, email: user!.email },
      successUrl: `${env.APP_URL}${back}?tipped=1`,
      cancelUrl: `${env.APP_URL}${back}`,
    });
    if (!url) {
      await prisma.tip.delete({ where: { id: tip.id } });
      redirect(`${back}?error=checkout`);
    }
    redirect(url!);
  }

  if (!devPaymentFallbackAllowed) {
    await prisma.tip.delete({ where: { id: tip.id } });
    redirect(`${back}?error=payments-unavailable`);
  }

  await prisma.order.create({
    data: {
      tenantId: tenant.id,
      userId: user!.id,
      description: "Trinkgeld",
      amountCents,
      currency: tip.currency,
      platformFeeCents: platformFeeCents(amountCents, tenant.platformFeePercent),
      status: "PAID",
    },
  });
  await prisma.tip.update({ where: { id: tip.id }, data: { status: "PAID" } });
  await awardPoints({ tenantId: tenant.id, userId: user!.id, trigger: "TIP", refType: "Tip", refId: tip.id }).catch(() => undefined);
  redirect(`${back}?tipped=1`);
}

/** Staff sets an optional fundraising goal, stored in the space settings JSON. */
export async function saveTipGoalAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId: tenant.id } });
  if (!space) return { error: "Space nicht gefunden." };

  const euro = parseFloat(String(fd.get("goal") || "").replace(",", "."));
  const goalCents = Math.max(0, Math.round((Number.isFinite(euro) ? euro : 0) * 100));
  const settings =
    space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
      ? (space.settings as Record<string, unknown>)
      : {};
  await prisma.space.update({
    where: { id: space.id },
    data: { settings: { ...settings, tipGoalCents: goalCents } },
  });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/c/${slug}/s/${space.slug}`);
  return ok;
}
