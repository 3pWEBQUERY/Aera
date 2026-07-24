import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/lib/guards";
import { systemPrisma } from "@/lib/prisma";
import { promoCodeStatus } from "@/lib/promo-codes";
import { PLAN_ORDER } from "@/lib/credit-plans";
import {
  PromoCodesManager,
  type PromoCodeRow,
} from "@/components/admin/codes-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.codes");
  return { title: t("metaTitle") };
}

/**
 * Platform promotion codes. Codes are global objects (no tenant), so every
 * query here runs on the privileged client.
 */
export default async function AdminCodesPage() {
  await requirePlatformAdmin();

  const rows = await systemPrisma.promoCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      createdBy: { select: { name: true } },
      redemptions: {
        orderBy: { redeemedAt: "desc" },
        take: 5,
        include: { tenant: { select: { name: true, slug: true } } },
      },
    },
  });

  const now = new Date();
  const codes: PromoCodeRow[] = rows.map((c) => ({
    id: c.id,
    code: c.code,
    plan: c.plan,
    label: c.label,
    note: c.note,
    durationDays: c.durationDays,
    maxRedemptions: c.maxRedemptions,
    redemptionCount: c.redemptionCount,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    isActive: c.isActive,
    status: promoCodeStatus(c, now),
    createdAt: c.createdAt.toISOString(),
    createdBy: c.createdBy?.name ?? null,
    recentRedemptions: c.redemptions.map((r) => ({
      tenantName: r.tenant.name,
      tenantSlug: r.tenant.slug,
      redeemedAt: r.redeemedAt.toISOString(),
    })),
  }));

  const totalRedemptions = codes.reduce((sum, c) => sum + c.redemptionCount, 0);
  const activeCount = codes.filter((c) => c.status === "ACTIVE").length;

  return (
    <PromoCodesManager
      codes={codes}
      plans={PLAN_ORDER.filter((p) => p !== "FREE")}
      stats={{
        total: codes.length,
        active: activeCount,
        redemptions: totalRedemptions,
      }}
    />
  );
}
