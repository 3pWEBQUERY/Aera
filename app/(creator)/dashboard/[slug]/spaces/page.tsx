import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import {
  SpacesManager,
  type SpaceRowData,
} from "@/components/dashboard/spaces-manager";
import { getTenantPlan } from "@/lib/plan";
import { limitsForPlan } from "@/lib/plan-features";

export default async function SpacesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);
  const plan = await getTenantPlan(tenant.id);
  const rows = await prisma.space.findMany({
    where: { tenantId: tenant.id },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { posts: true } } },
  });

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
  }));

  return (
    <SpacesManager
      slug={slug}
      spaces={spaces}
      plan={plan}
      spaceLimit={limitsForPlan(plan).maxSpaces}
    />
  );
}
