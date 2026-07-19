"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import prisma, { setTenantContext, withTenantTransaction } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireTenantAdmin } from "@/lib/guards";
import { env, features } from "@/lib/env";
import { entitlementKeys, grantEntitlement } from "@/lib/entitlements";
import { createRequestCheckout, platformFeeCents } from "@/lib/stripe";
import { isAllowedOneTimePriceCents } from "@/lib/apple-products";
import { tErr } from "@/lib/action-errors";
import type { RequestStatus } from "@/app/generated/prisma/client";

export interface ActionState {
  ok?: boolean;
  error?: string;
}
const ok: ActionState = { ok: true };
const devPaymentFallbackAllowed = process.env.NODE_ENV !== "production";

async function tenantBySlug(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (tenant) setTenantContext(tenant.id);
  return tenant;
}

/** Member submits a wish / custom request in a REQUESTS space. */
export async function submitRequestAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceSlug = String(fd.get("space") || "");
  const back = spaceSlug ? `/c/${slug}/s/${spaceSlug}` : `/c/${slug}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user!.id } },
  });
  if (membership?.status !== "ACTIVE") redirect(`/c/${slug}/join`);

  const space = await prisma.space.findFirst({
    where: { tenantId: tenant.id, slug: spaceSlug, type: "REQUESTS" },
  });
  if (!space) redirect(back);
  const title = String(fd.get("title") || "").trim().slice(0, 160);
  const body = String(fd.get("body") || "").trim().slice(0, 4000);
  if (title.length < 2) redirect(back);

  await prisma.memberRequest.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      requesterId: user!.id,
      title,
      body,
      status: "OPEN",
    },
  });
  revalidatePath(back);
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  redirect(`${back}?submitted=1`);
}

/**
 * Active member up/down-votes a wish (Reddit-style). Re-clicking the same
 * direction removes the vote; the opposite direction flips it. The request's
 * denormalized `score` is updated atomically so the board can sort by it.
 */
export async function voteRequestAction(fd: FormData): Promise<void> {
  const dir = String(fd.get("dir") || "");
  if (dir !== "UP" && dir !== "DOWN") return;
  const slug = String(fd.get("tenant"));
  const spaceSlug = String(fd.get("space") || "");
  const user = await getCurrentUser();
  if (!user) return;
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (membership?.status !== "ACTIVE") return;

  const req = await prisma.memberRequest.findFirst({
    where: { id: String(fd.get("requestId")), tenantId: tenant.id },
    select: { id: true },
  });
  if (!req) return;

  const value = dir === "UP" ? 1 : -1;
  const existing = await prisma.requestVote.findUnique({
    where: { requestId_userId: { requestId: req.id, userId: user.id } },
  });

  await withTenantTransaction(async (tx) => {
    let delta = value;
    if (!existing) {
      await tx.requestVote.create({
        data: { tenantId: tenant.id, requestId: req.id, userId: user.id, value },
      });
    } else if (existing.value === value) {
      await tx.requestVote.delete({ where: { id: existing.id } });
      delta = -value;
    } else {
      await tx.requestVote.update({ where: { id: existing.id }, data: { value } });
      delta = 2 * value;
    }
    await tx.memberRequest.update({ where: { id: req.id }, data: { score: { increment: delta } } });
  });

  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
}

/** Staff accepts / declines / prices a request. */
export async function updateRequestAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const requestId = String(fd.get("requestId"));
  const req = await prisma.memberRequest.findFirst({
    where: { id: requestId, tenantId: tenant.id },
    include: { space: { select: { slug: true } } },
  });
  if (!req) return { error: "Anfrage nicht gefunden." };

  const rawStatus = String(fd.get("status") || "");
  const status: RequestStatus | undefined = (
    ["OPEN", "ACCEPTED", "PRICED", "FULFILLED", "DECLINED"] as const
  ).includes(rawStatus as RequestStatus)
    ? (rawStatus as RequestStatus)
    : undefined;
  const priceCents = Math.max(0, Math.floor(Number(fd.get("priceCents") || 0) || 0));
  // Apple-IAP-Konformität: bepreiste Requests nur zu festen Apple-Preispunkten.
  if (fd.get("priceCents") !== null && priceCents > 0 && !isAllowedOneTimePriceCents(priceCents)) {
    return { error: await tErr("priceNotAllowed") };
  }
  const staffNote = String(fd.get("staffNote") || "").trim().slice(0, 2000) || null;

  await prisma.memberRequest.update({
    where: { id: req.id },
    data: {
      ...(status ? { status } : {}),
      ...(fd.get("priceCents") !== null ? { priceCents } : {}),
      staffNote,
      // A priced request gets a stable entitlement key for its payment.
      ...(status === "PRICED" || (priceCents > 0 && !req.entitlementKey)
        ? { entitlementKey: req.entitlementKey ?? `request:${req.id}` }
        : {}),
    },
  });
  if (req.space) {
    revalidatePath(`/dashboard/${slug}/spaces/${req.space.slug}`);
    revalidatePath(`/c/${slug}/s/${req.space.slug}`);
  }
  return ok;
}

export async function deleteRequestAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const requestId = String(fd.get("requestId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const req = await prisma.memberRequest.findFirst({ where: { id: requestId, tenantId: tenant.id } });
  if (req) await prisma.memberRequest.delete({ where: { id: req.id } });
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
}

/** Requester pays a PRICED request. */
export async function purchaseRequestAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceSlug = String(fd.get("space") || "");
  const requestId = String(fd.get("requestId"));
  const back = spaceSlug ? `/c/${slug}/s/${spaceSlug}` : `/c/${slug}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) return;
  const req = await prisma.memberRequest.findFirst({
    where: { id: requestId, tenantId: tenant.id, requesterId: user!.id },
  });
  if (!req || req.status !== "PRICED" || req.priceCents <= 0) redirect(back);
  const key = req.entitlementKey ?? `request:${req.id}`;
  const keys = await entitlementKeys(tenant.id, user!.id);
  if (keys.has(key)) redirect(back);

  if (features.stripe) {
    const url = await createRequestCheckout({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        platformFeePercent: tenant.platformFeePercent,
        stripeAccountId: tenant.stripeAccountId,
      },
      request: { id: req.id, title: req.title, priceCents: req.priceCents, currency: req.currency },
      user: { id: user!.id, email: user!.email },
      successUrl: `${env.APP_URL}${back}?paid=${req.id}`,
      cancelUrl: `${env.APP_URL}${back}`,
    });
    if (!url) redirect(`${back}?error=checkout`);
    redirect(url!);
  }

  if (!devPaymentFallbackAllowed) redirect(`${back}?error=payments-unavailable`);

  await prisma.order.create({
    data: {
      tenantId: tenant.id,
      userId: user!.id,
      description: `Anfrage: ${req.title}`,
      amountCents: req.priceCents,
      currency: req.currency,
      platformFeeCents: platformFeeCents(req.priceCents, tenant.platformFeePercent),
      status: "PAID",
      grantedEntitlementKey: key,
    },
  });
  await grantEntitlement({ tenantId: tenant.id, userId: user!.id, key, source: "PURCHASE", sourceId: req.id });
  await prisma.memberRequest.update({ where: { id: req.id }, data: { status: "FULFILLED", entitlementKey: key } });
  redirect(`${back}?paid=${req.id}`);
}
