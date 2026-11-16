import { requireTenantAdmin } from "@/lib/guards";
import { featureGate } from "@/components/dashboard/feature-gate";
import { hasPlatformAdminAccess } from "@/lib/platform-admin";
import prisma from "@/lib/prisma";
import { features } from "@/lib/env";
import {
  ProductsManager,
  type ProductRowData,
  type ProductCourseOption,
} from "@/components/dashboard/products-manager";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// Titel "{Seite} – {Community}" (Template im Dashboard-Layout).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.products");
  return { title: t("title") };
}

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
  const [rows, courseRows, shopSpace] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { orders: true } } },
    }),
    prisma.course.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, requiredEntitlementKey: true },
    }),
    // Products have no page of their own; the SHOP space lists them.
    prisma.space.findFirst({
      where: { tenantId: tenant.id, type: "SHOP", isArchived: false },
      orderBy: { sortOrder: "asc" },
      select: { slug: true },
    }),
  ]);

  // A course-access product grants the key its course requires (see
  // createProductAction), so the link is found through that key.
  const courseByKey = new Map(
    courseRows
      .filter((c) => c.requiredEntitlementKey)
      .map((c) => [c.requiredEntitlementKey as string, c.id]),
  );
  const courses: ProductCourseOption[] = courseRows.map((c) => ({
    id: c.id,
    title: c.title,
    // Bound to a membership (not to a course key): not sellable on its own.
    sellable: !c.requiredEntitlementKey || c.requiredEntitlementKey.startsWith("course:"),
  }));

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
    courseId:
      p.type === "COURSE_ACCESS" && p.grantsEntitlementKey
        ? (courseByKey.get(p.grantsEntitlementKey) ?? null)
        : null,
  }));

  return (
    <ProductsManager
      slug={slug}
      products={products}
      courses={courses}
      shopHref={shopSpace ? `/c/${slug}/s/${shopSpace.slug}` : null}
      payoutsReady={Boolean(tenant.stripeAccountId)}
      stripeReady={features.marketplacePayments}
      showSetupHint={hasPlatformAdminAccess(user)}
    />
  );
}
