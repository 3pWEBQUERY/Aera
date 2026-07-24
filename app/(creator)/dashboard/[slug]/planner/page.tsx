import { requireTenantAdmin } from "@/lib/guards";
import { featureGate } from "@/components/dashboard/feature-gate";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { features } from "@/lib/env";
import {
  PlannerManager,
  type PlanRow,
  type PlanChecklistItem,
} from "@/components/dashboard/planner-manager";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.planner");
  return { title: t("metaTitle") };
}

export default async function PlannerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);
  // Paywall: the queries below never run for a package without this feature.
  const locked = await featureGate(tenant.id, slug, "planner");
  if (locked) return locked;

  const [plans, spaces] = await Promise.all([
    prisma.contentPlan.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      take: 300,
      include: {
        media: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, url: true, contentType: true, storageObjectId: true },
        },
      },
    }),
    prisma.space.findMany({
      where: { tenantId: tenant.id, isArchived: false },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows: PlanRow[] = plans.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    type: p.type,
    status: p.status,
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    spaceId: p.spaceId,
    checklist: Array.isArray(p.checklist) ? (p.checklist as unknown as PlanChecklistItem[]) : [],
    aiNotes: p.aiNotes,
    media: p.media.map((m) => ({
      id: m.id,
      url: m.url,
      storageObjectId: m.storageObjectId,
      contentType: m.contentType,
    })),
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <PlannerManager slug={slug} plans={rows} spaces={spaces} aiEnabled={features.gemini} />
  );
}
