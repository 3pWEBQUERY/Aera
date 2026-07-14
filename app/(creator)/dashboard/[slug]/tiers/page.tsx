import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import { features } from "@/lib/env";
import {
  TiersManager,
  type TierRowData,
} from "@/components/dashboard/tiers-manager";

export default async function TiersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);
  const rows = await prisma.membershipTier.findMany({
    where: { tenantId: tenant.id },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { memberships: true } } },
  });

  const tiers: TierRowData[] = rows.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    // Casts entfallen nach `npm run db:migrate` (regeneriert den Client).
    coverUrl: (t as { coverUrl?: string | null }).coverUrl ?? null,
    isRecommended: (t as { isRecommended?: boolean }).isRecommended ?? false,
    priceCents: t.priceCents,
    currency: t.currency,
    interval: t.interval,
    entitlementKey: t.entitlementKey,
    isDefault: t.isDefault,
    isPublic: t.isPublic,
    memberCount: t._count.memberships,
  }));

  return <TiersManager slug={slug} tiers={tiers} stripeReady={features.stripe} />;
}
