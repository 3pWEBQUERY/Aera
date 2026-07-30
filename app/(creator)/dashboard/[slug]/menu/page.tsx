import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import { parseLayout } from "@/lib/layout";
import { MenuEditor } from "@/components/dashboard/menu-editor";

export default async function HeroMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);

  const [spaceRows, tipsSpace] = await Promise.all([
    prisma.space.findMany({
      where: { tenantId: tenant.id, isArchived: false },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true, type: true, visibility: true },
    }),
    // "Unterstützen" zeigt auf den Trinkgeld-Space. Den gibt es nicht in jeder
    // Community — fehlt er, blendet die Kopfzeile den Punkt von selbst aus,
    // und der Editor sagt es vorher.
    prisma.space.findFirst({
      where: { tenantId: tenant.id, type: "TIPS", isArchived: false },
      select: { slug: true },
    }),
  ]);

  const config = parseLayout((tenant as unknown as { layout?: unknown }).layout ?? null);

  return (
    <MenuEditor
      slug={slug}
      spaces={spaceRows}
      tipsSlug={tipsSpace?.slug ?? null}
      community={{
        name: tenant.name,
        logoUrl: tenant.logoUrl,
        primaryColor: tenant.primaryColor,
        tagline: tenant.tagline ?? tenant.description ?? null,
      }}
      initial={config.heroMenu}
    />
  );
}
