"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireTenantAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import { redeemPromoCode } from "@/lib/promo-codes";

export interface RedeemCodeState {
  error?: string;
  ok?: boolean;
  /** Package the community was lifted onto (display name). */
  planName?: string;
  /** ISO date the grant runs out, or null for a lifetime grant. */
  expiresAt?: string | null;
}

/**
 * Redeem an influencer/partner code for the current community.
 * Owner-only: a code changes what the community pays for.
 */
export async function redeemPromoCodeAction(
  _prev: RedeemCodeState,
  fd: FormData,
): Promise<RedeemCodeState> {
  const slug = String(fd.get("tenant") || "");
  const { tenant, user } = await requireTenantAdmin(slug, "OWNER");
  const t = await getTranslations("dashboard.plans.redeem.errors");

  const result = await redeemPromoCode({
    rawCode: fd.get("code"),
    tenantId: tenant.id,
    userId: user.id,
  });

  if (!result.ok) return { error: t(result.reason) };

  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "plan.promo.redeem",
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: {
      plan: result.plan,
      expiresAt: result.expiresAt?.toISOString() ?? null,
    },
  });

  revalidatePath(`/dashboard/${slug}`, "layout");
  return {
    ok: true,
    planName: result.planName,
    expiresAt: result.expiresAt?.toISOString() ?? null,
  };
}
