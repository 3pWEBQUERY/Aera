import { postingPolicyOf } from "@/lib/entitlements";
import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import {
  SpacesManager,
  type SpaceRowData,
  type SpaceAccessTier,
} from "@/components/dashboard/spaces-manager";
import { getTenantPlan } from "@/lib/plan";
import { limitsForPlan } from "@/lib/plan-features";
import { SPACE_CONTENT_COUNT_SELECT, sumSpaceContent } from "@/lib/space-content";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// Titel "{Seite} – {Community}" (Template im Dashboard-Layout).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.spaces");
  return { title: t("title") };
}

export default async function SpacesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);
  const plan = await getTenantPlan(tenant.id);
  const [rows, tierRows] = await Promise.all([
    prisma.space.findMany({
      where: { tenantId: tenant.id },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: SPACE_CONTENT_COUNT_SELECT } },
    }),
    // Alle Mitgliedschaften: bezahlte sind auswählbar, kostenlose braucht die
    // Karte, um einen älteren Key mit Namen statt als Code zu zeigen.
    prisma.membershipTier.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ priceCents: "asc" }, { sortOrder: "asc" }],
      select: {
        name: true,
        entitlementKey: true,
        priceCents: true,
        currency: true,
        interval: true,
        isPublic: true,
      },
    }),
  ]);

  const spaces: SpaceRowData[] = rows.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    type: s.type,
    visibility: s.visibility,
    description: s.description,
    requiredEntitlementKey: s.requiredEntitlementKey,
    isArchived: s.isArchived,
    postCount: s._count.posts,
    contentCount: sumSpaceContent(s._count),
    postingPolicy: postingPolicyOf(s.settings),
  }));
  const tiers: SpaceAccessTier[] = tierRows.map((tr) => ({
    name: tr.name,
    key: tr.entitlementKey,
    priceCents: tr.priceCents,
    currency: tr.currency,
    interval: tr.interval,
    isPublic: tr.isPublic,
  }));

  return (
    <SpacesManager
      slug={slug}
      spaces={spaces}
      tiers={tiers}
      plan={plan}
      spaceLimit={limitsForPlan(plan).maxSpaces}
    />
  );
}
