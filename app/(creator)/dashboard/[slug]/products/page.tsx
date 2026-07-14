import { requireTenantAdmin } from "@/lib/guards";
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
  const { tenant } = await requireTenantAdmin(slug);
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
    <ProductsManager slug={slug} products={products} stripeReady={features.stripe} />
  );
}
