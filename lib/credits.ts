import "server-only";
import { randomUUID } from "node:crypto";
import prisma, { withTenantTransaction, withTenantTransactionFor } from "./prisma";
import type {
  CreatorPlan,
  AiCreditWallet,
  SubscriptionStatus,
} from "@/app/generated/prisma/client";
import {
  PLANS,
  PLAN_ORDER,
  CREDIT_PACKS,
  TOKENS_PER_CREDIT,
  creditsForTokens,
  type PlanInfo,
  type CreditPack,
} from "./credit-plans";

// Re-export the shared catalog so existing imports from "@/lib/credits" keep
// working (the API route imports PLANS from here).
export {
  PLANS,
  PLAN_ORDER,
  CREDIT_PACKS,
  TOKENS_PER_CREDIT,
  creditsForTokens,
};
export type { PlanInfo, CreditPack };

// ---------------------------------------------------------------------------
// Wallet helpers
// ---------------------------------------------------------------------------
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Fetch (or lazily create) the tenant's wallet and enforce its billing period. */
export async function getOrCreateWallet(tenantId: string): Promise<AiCreditWallet> {
  let wallet = await prisma.aiCreditWallet.findUnique({ where: { tenantId } });
  if (!wallet) {
    // A new tenant starts on the only plan that requires no payment proof.
    const plan = PLANS.FREE;
    const now = new Date();
    try {
      wallet = await prisma.aiCreditWallet.create({
        data: {
          tenantId,
          plan: plan.key,
          monthlyCredits: plan.monthlyCredits,
          includedRemaining: plan.monthlyCredits,
          purchasedRemaining: 0,
          periodStart: now,
          periodEnd: addMonths(now, 1),
        },
      });
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "P2002"
      ) {
        throw error;
      }
      // Another request created the tenant's unique wallet first.
      wallet = await prisma.aiCreditWallet.findUnique({ where: { tenantId } });
      if (!wallet) throw error;
    }
  }
  return ensurePeriod(wallet);
}

/**
 * Free wallets roll forward locally. Paid allowances are never replenished by
 * the calendar: after their paid period expires they are frozen until Stripe
 * confirms the next invoice.
 */
async function ensurePeriod(wallet: AiCreditWallet): Promise<AiCreditWallet> {
  const now = new Date();
  if (now < wallet.periodEnd) return wallet;

  if (wallet.plan !== "FREE") {
    await prisma.aiCreditWallet.updateMany({
      where: { id: wallet.id, periodEnd: { lte: now }, includedRemaining: { gt: 0 } },
      data: { includedRemaining: 0 },
    });
    return (
      (await prisma.aiCreditWallet.findUnique({ where: { id: wallet.id } })) ??
      wallet
    );
  }

  // Advance to the current period (guard against long gaps).
  let periodStart = wallet.periodStart;
  let periodEnd = wallet.periodEnd;
  let guard = 0;
  while (now >= periodEnd && guard < 240) {
    periodStart = periodEnd;
    periodEnd = addMonths(periodEnd, 1);
    guard++;
  }
  // Compare-and-set: only one concurrent request may roll this period over.
  await prisma.aiCreditWallet.updateMany({
    where: { id: wallet.id, periodEnd: { lte: now } },
    data: { includedRemaining: wallet.monthlyCredits, periodStart, periodEnd },
  });
  return (
    (await prisma.aiCreditWallet.findUnique({ where: { id: wallet.id } })) ??
    wallet
  );
}

export function walletBalance(wallet: AiCreditWallet): number {
  return wallet.includedRemaining + wallet.purchasedRemaining;
}

export async function hasCreditsLeft(tenantId: string): Promise<boolean> {
  const wallet = await getOrCreateWallet(tenantId);
  return walletBalance(wallet) > 0;
}

export interface CreditReservation {
  id: string;
  tenantId: string;
}

/** Atomically reserve one credit before an external AI provider is called. */
export async function reserveCredit(params: {
  tenantId: string;
  userId?: string | null;
  conversationId?: string | null;
  kind?: string;
}): Promise<CreditReservation | null> {
  await getOrCreateWallet(params.tenantId);
  const id = randomUUID();
  const rows = await withTenantTransactionFor(params.tenantId, (tx) =>
    tx.$queryRaw<Array<{ reserved: boolean }>>`
      SELECT aera_reserve_ai_credit(
        ${id},
        ${params.tenantId},
        ${params.userId ?? null},
        ${params.conversationId ?? null},
        ${params.kind ?? "assistant_message"}
      ) AS "reserved"
    `,
  );
  return rows[0]?.reserved ? { id, tenantId: params.tenantId } : null;
}

/** Settle a reservation against actual provider token usage. */
export async function settleCreditReservation(params: {
  reservation: CreditReservation;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}): Promise<{ credits: number }> {
  const requestedCredits = creditsForTokens(params.totalTokens);
  const usageId = randomUUID();
  const rows = await withTenantTransactionFor(params.reservation.tenantId, (tx) =>
    tx.$queryRaw<Array<{ charged: number }>>`
      SELECT aera_settle_ai_credit(
        ${params.reservation.id},
        ${params.reservation.tenantId},
        ${usageId},
        ${Math.max(0, params.promptTokens)},
        ${Math.max(0, params.outputTokens)},
        ${Math.max(0, params.totalTokens)},
        ${requestedCredits}
      ) AS "charged"
    `,
  );
  return { credits: Number(rows[0]?.charged ?? 0) };
}

/** Return a reservation when the provider call failed before settlement. */
export async function releaseCreditReservation(
  reservation: CreditReservation,
): Promise<void> {
  await withTenantTransactionFor(reservation.tenantId, (tx) =>
    tx.$queryRaw<Array<{ released: boolean }>>`
      SELECT aera_release_ai_credit(
        ${reservation.id},
        ${reservation.tenantId}
      ) AS "released"
    `,
  );
}

/**
 * Deduct credits for a completed Gemini call and log a usage event. Draws from
 * the monthly allowance first, then purchased credits. Never drops below zero.
 */
export async function consumeCredits(params: {
  tenantId: string;
  userId?: string | null;
  conversationId?: string | null;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  kind?: string;
}): Promise<{ credits: number }> {
  const reservation = await reserveCredit(params);
  if (!reservation) return { credits: 0 };
  return settleCreditReservation({
    reservation,
    promptTokens: params.promptTokens,
    outputTokens: params.outputTokens,
    totalTokens: params.totalTokens,
  });
}

/**
 * Credit a paid pack after Stripe has confirmed the Checkout Session.
 * The unique session id makes webhook retries safe.
 */
export async function grantPaidCreditPack(params: {
  tenantId: string;
  userId: string | null;
  packId: string;
  stripeSessionId: string;
  stripePaymentIntentId?: string | null;
}): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const pack = CREDIT_PACKS.find((p) => p.id === params.packId);
  if (!pack) return { ok: false, error: "Unbekanntes Credit-Paket." };
  const wallet = await getOrCreateWallet(params.tenantId);

  try {
    await withTenantTransaction(async (tx) => {
      await tx.aiCreditWallet.update({
        where: { id: wallet.id },
        data: { purchasedRemaining: { increment: pack.credits } },
      });
      await tx.aiCreditPurchase.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          packId: pack.id,
          credits: pack.credits,
          priceCents: pack.priceCents,
          status: "COMPLETED",
          stripeSessionId: params.stripeSessionId,
          stripePaymentIntentId: params.stripePaymentIntentId ?? null,
        },
      });
    });
    return { ok: true };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { ok: true, duplicate: true };
    }
    throw error;
  }
}

/** Mark a Stripe-refunded pack and remove only its still-unused credits. */
export async function refundPaidCreditPack(params: {
  tenantId: string;
  stripePaymentIntentId: string;
}): Promise<{ removedCredits: number }> {
  const rows = await withTenantTransactionFor(params.tenantId, (tx) =>
    tx.$queryRaw<Array<{ removed: number }>>`
      SELECT aera_refund_ai_credit_purchase(
        ${params.tenantId},
        ${params.stripePaymentIntentId}
      ) AS "removed"
    `,
  );
  return { removedCredits: Number(rows[0]?.removed ?? 0) };
}

/** Activate a paid creator plan after Stripe created the subscription. */
export async function activatePaidCreatorPlan(params: {
  tenantId: string;
  plan: CreatorPlan;
  stripeSubscriptionId: string;
  stripeCustomerId?: string | null;
}): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const info = PLANS[params.plan];
  if (!info || info.priceCents <= 0) {
    return { ok: false, error: "Unbekanntes oder kostenloses Paket." };
  }
  const wallet = await getOrCreateWallet(params.tenantId);
  if (wallet.stripeSubscriptionId === params.stripeSubscriptionId) {
    return { ok: true, duplicate: true };
  }

  const existing = await prisma.aiCreditWallet.findUnique({
    where: { stripeSubscriptionId: params.stripeSubscriptionId },
    select: { id: true },
  });
  if (existing) return { ok: true, duplicate: true };

  const now = new Date();
  const changed = await prisma.aiCreditWallet.updateMany({
    where: {
      id: wallet.id,
      // Compare against the subscription seen before the uniqueness check.
      // If invoice.paid associated/refilled this wallet in the meantime, this
      // Checkout completion must not reset the paid allowance below.
      stripeSubscriptionId: wallet.stripeSubscriptionId,
      lastPaidStripeInvoiceId: null,
      OR: [
        { creatorSubscriptionStatus: null },
        { creatorSubscriptionStatus: { not: "ACTIVE" } },
      ],
    },
    data: {
      plan: info.key,
      monthlyCredits: info.monthlyCredits,
      // Checkout completion only associates the subscription. The paid
      // allowance is released by invoice.paid, the authoritative money event.
      includedRemaining: 0,
      periodStart: now,
      periodEnd: addMonths(now, 1),
      stripeCustomerId: params.stripeCustomerId ?? wallet.stripeCustomerId,
      stripeSubscriptionId: params.stripeSubscriptionId,
      lastPaidStripeInvoiceId: null,
      creatorSubscriptionStatus: "INCOMPLETE",
      planCancelAtPeriodEnd: false,
      planCurrentPeriodEnd: null,
    },
  });
  return changed.count === 1
    ? { ok: true }
    : { ok: true, duplicate: true };
}

/**
 * Release one creator-plan allowance after Stripe confirms a paid invoice.
 * The invoice id and monotonically increasing period end make this safe across
 * retries and out-of-order webhook delivery.
 */
export async function refillCreatorPlanFromPaidInvoice(params: {
  tenantId: string;
  plan: CreatorPlan;
  stripeSubscriptionId: string;
  stripeInvoiceId: string;
  stripeCustomerId?: string | null;
  periodStart: Date;
  periodEnd: Date;
}): Promise<{ ok: boolean; refilled: boolean; error?: string }> {
  const info = PLANS[params.plan];
  if (!info || info.priceCents <= 0) {
    return { ok: false, refilled: false, error: "Unbekanntes oder kostenloses Paket." };
  }
  if (
    !Number.isFinite(params.periodStart.getTime()) ||
    !Number.isFinite(params.periodEnd.getTime()) ||
    params.periodEnd <= params.periodStart
  ) {
    return { ok: false, refilled: false, error: "Ungültiger Stripe-Abrechnungszeitraum." };
  }

  const wallet = await getOrCreateWallet(params.tenantId);
  const changed = await prisma.aiCreditWallet.updateMany({
    where: {
      id: wallet.id,
      AND: [
        {
          OR: [
            { stripeSubscriptionId: null },
            { stripeSubscriptionId: params.stripeSubscriptionId },
          ],
        },
        {
          OR: [
            { lastPaidStripeInvoiceId: null },
            {
              lastPaidStripeInvoiceId: { not: params.stripeInvoiceId },
              periodEnd: { lt: params.periodEnd },
            },
          ],
        },
      ],
    },
    data: {
      plan: info.key,
      monthlyCredits: info.monthlyCredits,
      includedRemaining: info.monthlyCredits,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      stripeCustomerId: params.stripeCustomerId ?? wallet.stripeCustomerId,
      stripeSubscriptionId: params.stripeSubscriptionId,
      lastPaidStripeInvoiceId: params.stripeInvoiceId,
      creatorSubscriptionStatus: "ACTIVE",
      planCancelAtPeriodEnd: false,
      planCurrentPeriodEnd: params.periodEnd,
    },
  });
  return { ok: true, refilled: changed.count === 1 };
}

/** Keep the local creator-plan lifecycle in sync with Stripe. */
export async function updateCreatorSubscription(params: {
  tenantId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date | null;
}): Promise<void> {
  await prisma.aiCreditWallet.updateMany({
    where: {
      tenantId: params.tenantId,
      stripeSubscriptionId: params.stripeSubscriptionId,
    },
    data: {
      creatorSubscriptionStatus: params.status,
      planCancelAtPeriodEnd: params.cancelAtPeriodEnd,
      planCurrentPeriodEnd: params.currentPeriodEnd,
      ...(params.status === "ACTIVE" || params.status === "TRIALING"
        ? {}
        : { includedRemaining: 0 }),
    },
  });
}

/** Downgrade only after Stripe confirms the paid subscription has ended. */
export async function endCreatorSubscription(params: {
  tenantId: string;
  stripeSubscriptionId: string;
}): Promise<void> {
  const free = PLANS.FREE;
  const now = new Date();
  await prisma.aiCreditWallet.updateMany({
    where: {
      tenantId: params.tenantId,
      stripeSubscriptionId: params.stripeSubscriptionId,
    },
    data: {
      plan: free.key,
      monthlyCredits: free.monthlyCredits,
      includedRemaining: free.monthlyCredits,
      periodStart: now,
      periodEnd: addMonths(now, 1),
      stripeSubscriptionId: null,
      lastPaidStripeInvoiceId: null,
      creatorSubscriptionStatus: "CANCELED",
      planCancelAtPeriodEnd: false,
      planCurrentPeriodEnd: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Summary for the UI
// ---------------------------------------------------------------------------
export interface UsageEntry {
  id: string;
  kind: string;
  credits: number;
  totalTokens: number;
  createdAt: string;
}

export interface CreditSummary {
  plan: CreatorPlan;
  planName: string;
  monthlyCredits: number;
  includedRemaining: number;
  purchasedRemaining: number;
  balance: number;
  usedThisPeriod: number;
  periodStart: string;
  periodEnd: string;
  creatorSubscriptionStatus: SubscriptionStatus | null;
  planCancelAtPeriodEnd: boolean;
  planCurrentPeriodEnd: string | null;
  plans: PlanInfo[];
  packs: CreditPack[];
  recent: UsageEntry[];
}

export async function getCreditSummary(tenantId: string): Promise<CreditSummary> {
  const wallet = await getOrCreateWallet(tenantId);
  const recent = await prisma.aiUsageEvent.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const usedThisPeriod = Math.max(0, wallet.monthlyCredits - wallet.includedRemaining);

  return {
    plan: wallet.plan,
    planName: PLANS[wallet.plan].name,
    monthlyCredits: wallet.monthlyCredits,
    includedRemaining: wallet.includedRemaining,
    purchasedRemaining: wallet.purchasedRemaining,
    balance: walletBalance(wallet),
    usedThisPeriod,
    periodStart: wallet.periodStart.toISOString(),
    periodEnd: wallet.periodEnd.toISOString(),
    creatorSubscriptionStatus: wallet.creatorSubscriptionStatus,
    planCancelAtPeriodEnd: wallet.planCancelAtPeriodEnd,
    planCurrentPeriodEnd: wallet.planCurrentPeriodEnd?.toISOString() ?? null,
    plans: PLAN_ORDER.map((k) => PLANS[k]),
    packs: CREDIT_PACKS,
    recent: recent.map((r) => ({
      id: r.id,
      kind: r.kind,
      credits: r.credits,
      totalTokens: r.totalTokens,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
