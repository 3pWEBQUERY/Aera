import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import { getCommunityCoverUrl } from "@/lib/tenant";
import { parseLayout } from "@/lib/layout";
import { LayoutEditor } from "@/components/dashboard/layout-editor";

export default async function LayoutBuilderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);

  const [coverUrl, spaceRows] = await Promise.all([
    getCommunityCoverUrl(tenant.id),
    prisma.space.findMany({
      where: { tenantId: tenant.id, isArchived: false },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true, visibility: true, type: true },
    }),
  ]);

  const config = parseLayout(
    (tenant as unknown as { layout?: unknown }).layout ?? null,
  );

  return (
    <LayoutEditor
      slug={slug}
      spaces={spaceRows}
      initial={{
        name: tenant.name,
        logoUrl: tenant.logoUrl,
        primaryColor: tenant.primaryColor,
        description: tenant.description,
        coverUrl,
        sectionsByAudience: config.sectionsByAudience,
        nav: config.nav,
        header: config.header,
      }}
    />
  );
}
