import { requireTenantAdmin } from "@/lib/guards";
import { featureGate } from "@/components/dashboard/feature-gate";
import { hasPlatformAdminAccess } from "@/lib/platform-admin";
import prisma from "@/lib/prisma";
import { features } from "@/lib/env";
import {
  ProductsManager,
  type ProductRowData,
} from "@/components/dashboard/products-manager";

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user } = await requireTenantAdmin(slug);
  // Paywall: the queries below never run for a package without this feature.
  const locked = await featureGate(tenant.id, slug, "products");
  if (locked) return locked;
  const rows = await prisma.product.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { orders: true } } },
  });

  const products: ProductRowData[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    currency: p.currency,
    type: p.type,
    downloadUrl: p.downloadUrl,
    coverUrl: p.coverUrl,
    images: p.images,
    isPublished: p.isPublished,
    requiresShipping: p.requiresShipping,
    freeShipping: p.freeShipping,
    shippingCents: p.shippingCents,
    stock: p.stock,
    salesCount: p._count.orders,
  }));

  return (
    <ProductsManager
      slug={slug}
      products={products}
      stripeReady={features.marketplacePayments}
      showSetupHint={hasPlatformAdminAccess(user)}
    />
  );
}
