import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";
import {
  buildViewerContext,
  toGalleryPackageDto,
  toOrderDto,
} from "@/lib/mobile/serializers";

// GET /api/mobile/v1/c/{slug}/library → { packages: [GalleryPackage owned], orders: Order[] }
// Gekaufte/freigeschaltete Medien-Pakete + Bestellhistorie in dieser Community.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const { ctx } = await buildViewerContext(tenant, user);
  const mediaKeys = [...ctx.keys].filter(
    (k) => k.startsWith("media:") || k.startsWith("media-item:"),
  );
  const itemKeys = mediaKeys.filter((k) => k.startsWith("media-item:"));

  const [ownedPackages, itemPackages, orders] = await Promise.all([
    mediaKeys.length
      ? prisma.mediaPackage.findMany({
          where: { tenantId: tenant.id, entitlementKey: { in: mediaKeys } },
          orderBy: { createdAt: "desc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        })
      : Promise.resolve([]),
    // Pakete, aus denen einzelne Medien gekauft wurden.
    itemKeys.length
      ? prisma.mediaPackage.findMany({
          where: {
            tenantId: tenant.id,
            items: { some: { entitlementKey: { in: itemKeys } } },
          },
          orderBy: { createdAt: "desc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        })
      : Promise.resolve([]),
    prisma.order.findMany({
      where: { tenantId: tenant.id, userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { product: { select: { name: true, downloadUrl: true } } },
    }),
  ]);

  const seen = new Set<string>();
  const packages = [...ownedPackages, ...itemPackages]
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .map((p) => toGalleryPackageDto(p, ctx));

  return jsonOk({
    packages,
    orders: orders.map(toOrderDto),
  });
}
