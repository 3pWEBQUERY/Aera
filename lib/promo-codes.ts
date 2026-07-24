import "server-only";
import { randomInt } from "node:crypto";
import { systemPrisma } from "./prisma";
import { PLANS, type PlanKey } from "./credit-plans";
import { PLAN_RANK } from "./plan-features";
import type { CreatorPlan, PromoCode } from "@/app/generated/prisma/client";

// ---------------------------------------------------------------------------
// Platform promotion codes.
//
// A code is minted in /admin/codes and handed to an influencer or launch
// partner. Redeeming it lifts ONE community onto the code's package without
// Stripe. Billing always outranks a promotion: a wallet that Stripe owns can
// never be overwritten by a code, and activating a paid subscription clears
// any promo grant (see lib/credits.ts).
// ---------------------------------------------------------------------------

/** Unambiguous alphabet — no O/0, I/1, so codes survive being read aloud. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
export const MAX_BATCH_SIZE = 50;

/** Uppercase, strip whitespace, normalise dashes. Idempotent. */
export function normalizePromoCode(raw: unknown): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function isValidPromoCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

function randomSegment(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** `AERA-PRO-7K2QX4` — readable, unguessable enough for a promo. */
export function generatePromoCode(prefix?: string): string {
  const clean = normalizePromoCode(prefix).slice(0, 12);
  const body = randomSegment(8);
  return normalizePromoCode(clean ? `${clean}-${body}` : body);
}

// ---------------------------------------------------------------------------
// Admin: minting
// ---------------------------------------------------------------------------

export interface CreatePromoCodesInput {
  plan: PlanKey;
  quantity: number;
  prefix?: string;
  label?: string | null;
  note?: string | null;
  /** Access runtime in days. Null/0 = for as long as the code stays active. */
  durationDays?: number | null;
  maxRedemptions?: number;
  /** Code can no longer be redeemed after this date. */
  expiresAt?: Date | null;
  createdById: string;
}

export async function createPromoCodes(
  input: CreatePromoCodesInput,
): Promise<PromoCode[]> {
  const quantity = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(input.quantity || 1)));
  const maxRedemptions = Math.min(
    100000,
    Math.max(1, Math.floor(input.maxRedemptions || 1)),
  );
  const durationDays =
    input.durationDays && input.durationDays > 0
      ? Math.min(3650, Math.floor(input.durationDays))
      : null;

  const created: PromoCode[] = [];
  for (let i = 0; i < quantity; i++) {
    // Collisions are astronomically unlikely, but a unique index plus a couple
    // of retries makes a batch import deterministic instead of merely probable.
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = generatePromoCode(input.prefix);
      if (!isValidPromoCode(code)) continue;
      try {
        created.push(
          await systemPrisma.promoCode.create({
            data: {
              code,
              plan: input.plan as CreatorPlan,
              label: input.label?.trim() || null,
              note: input.note?.trim() || null,
              durationDays,
              maxRedemptions,
              expiresAt: input.expiresAt ?? null,
              createdById: input.createdById,
            },
          }),
        );
        break;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
  }
  return created;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function setPromoCodeActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  await systemPrisma.promoCode.updateMany({ where: { id }, data: { isActive } });
}

export async function deletePromoCode(id: string): Promise<void> {
  // Redemptions cascade; wallets keep their grant (FK is ON DELETE SET NULL)
  // so nobody loses access because an admin tidied up the code list.
  await systemPrisma.promoCode.deleteMany({ where: { id } });
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type PromoCodeStatus = "ACTIVE" | "PAUSED" | "EXPIRED" | "USED_UP";

export function promoCodeStatus(
  code: Pick<PromoCode, "isActive" | "expiresAt" | "redemptionCount" | "maxRedemptions">,
  now: Date = new Date(),
): PromoCodeStatus {
  if (!code.isActive) return "PAUSED";
  if (code.expiresAt && code.expiresAt <= now) return "EXPIRED";
  if (code.redemptionCount >= code.maxRedemptions) return "USED_UP";
  return "ACTIVE";
}

// ---------------------------------------------------------------------------
// Redemption
// ---------------------------------------------------------------------------

export type RedeemFailureReason =
  | "invalid"
  | "not_found"
  | "paused"
  | "expired"
  | "used_up"
  | "already_redeemed"
  | "stripe_active"
  | "not_an_upgrade";

export type RedeemPromoCodeResult =
  | {
      ok: true;
      plan: PlanKey;
      planName: string;
      expiresAt: Date | null;
      monthlyCredits: number;
    }
  | { ok: false; reason: RedeemFailureReason };

/**
 * Redeem `rawCode` for one community.
 *
 * Runs on the privileged client (promotion codes are a platform artefact, not
 * tenant data) and inside a single transaction, so a code with one seat left
 * cannot be claimed twice by concurrent requests.
 */
export async function redeemPromoCode(params: {
  rawCode: unknown;
  tenantId: string;
  userId: string;
}): Promise<RedeemPromoCodeResult> {
  const code = normalizePromoCode(params.rawCode);
  if (!isValidPromoCode(code)) return { ok: false, reason: "invalid" };

  const promo = await systemPrisma.promoCode.findUnique({ where: { code } });
  if (!promo) return { ok: false, reason: "not_found" };

  const now = new Date();
  const status = promoCodeStatus(promo, now);
  if (status === "PAUSED") return { ok: false, reason: "paused" };
  if (status === "EXPIRED") return { ok: false, reason: "expired" };
  if (status === "USED_UP") return { ok: false, reason: "used_up" };

  const wallet = await systemPrisma.aiCreditWallet.findUnique({
    where: { tenantId: params.tenantId },
  });

  // A live Stripe subscription is money the creator already pays — never
  // silently replace it with a (possibly smaller) promotion package.
  if (
    wallet?.planSource === "STRIPE" &&
    (wallet.creatorSubscriptionStatus === "ACTIVE" ||
      wallet.creatorSubscriptionStatus === "TRIALING")
  ) {
    return { ok: false, reason: "stripe_active" };
  }

  const currentPlan = (wallet?.plan ?? "FREE") as PlanKey;
  const targetPlan = promo.plan as PlanKey;
  if (PLAN_RANK[targetPlan] <= PLAN_RANK[currentPlan]) {
    return { ok: false, reason: "not_an_upgrade" };
  }

  const info = PLANS[targetPlan];
  const expiresAt = promo.durationDays
    ? new Date(now.getTime() + promo.durationDays * 24 * 60 * 60 * 1000)
    : null;
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  try {
    await systemPrisma.$transaction(async (tx) => {
      // Compare-and-set on the counter: the seat is only ours if this update
      // actually moved the row.
      const claimed = await tx.promoCode.updateMany({
        where: {
          id: promo.id,
          isActive: true,
          redemptionCount: { lt: promo.maxRedemptions },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { redemptionCount: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new PromoRedeemError("used_up");

      // Unique (codeId, tenantId) turns a double submit into a clean error.
      await tx.promoCodeRedemption.create({
        data: {
          codeId: promo.id,
          tenantId: params.tenantId,
          userId: params.userId,
          planBefore: currentPlan as CreatorPlan,
          planAfter: targetPlan as CreatorPlan,
          expiresAt,
        },
      });

      await tx.aiCreditWallet.upsert({
        where: { tenantId: params.tenantId },
        create: {
          tenantId: params.tenantId,
          plan: targetPlan as CreatorPlan,
          monthlyCredits: info.monthlyCredits,
          includedRemaining: info.monthlyCredits,
          purchasedRemaining: 0,
          periodStart: now,
          periodEnd,
          planSource: "PROMO",
          promoCodeId: promo.id,
          promoExpiresAt: expiresAt,
        },
        update: {
          plan: targetPlan as CreatorPlan,
          monthlyCredits: info.monthlyCredits,
          // Detach any dead Stripe subscription: otherwise a later
          // `customer.subscription.deleted` for that id would match this wallet
          // and reset a perfectly valid promotion back to FREE.
          stripeSubscriptionId: null,
          lastPaidStripeInvoiceId: null,
          creatorSubscriptionStatus: null,
          planCancelAtPeriodEnd: false,
          planCurrentPeriodEnd: null,
          // Top the allowance up to the new package without ever shrinking it.
          includedRemaining: Math.max(
            wallet?.includedRemaining ?? 0,
            info.monthlyCredits,
          ),
          periodStart: now,
          periodEnd,
          planSource: "PROMO",
          promoCodeId: promo.id,
          promoExpiresAt: expiresAt,
        },
      });
    });
  } catch (error) {
    if (error instanceof PromoRedeemError) return { ok: false, reason: error.reason };
    if (isUniqueViolation(error)) return { ok: false, reason: "already_redeemed" };
    throw error;
  }

  return {
    ok: true,
    plan: targetPlan,
    planName: info.name,
    expiresAt,
    monthlyCredits: info.monthlyCredits,
  };
}

class PromoRedeemError extends Error {
  constructor(readonly reason: RedeemFailureReason) {
    super(reason);
    this.name = "PromoRedeemError";
  }
}
