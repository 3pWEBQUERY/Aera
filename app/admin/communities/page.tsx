import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { CommunitiesManager } from "@/components/admin/communities-manager";
import { AdminPagination } from "@/components/admin/pagination";
import type { Prisma } from "@/app/generated/prisma/client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("communities") };
}

const PAGE_SIZE = 30;

export default async function AdminCommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requirePlatformAdmin();
  const { q: qRaw, page: pageRaw } = await searchParams;
  const q = (qRaw ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number(pageRaw) || 1);

  const where: Prisma.TenantWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
          { tagline: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        _count: { select: { memberships: true, posts: true, orders: true } },
        owner: { select: { name: true, email: true } },
      },
    }),
    prisma.tenant.count({ where }),
  ]);

  const rows = tenants.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    logoUrl: t.logoUrl,
    primaryColor: t.primaryColor,
    customDomain: t.customDomain,
    platformFeePercent: t.platformFeePercent,
    // `category` is new in the schema; the generated client may be older.
    category: (t as { category?: string | null }).category ?? null,
    createdAt: t.createdAt.toISOString(),
    ownerName: t.owner.name,
    ownerEmail: t.owner.email,
    members: t._count.memberships,
    posts: t._count.posts,
    orders: t._count.orders,
  }));

  return (
    <div className="space-y-6">
      <CommunitiesManager rows={rows} total={total} q={q} />
      <AdminPagination
        basePath="/admin/communities"
        page={page}
        pageCount={Math.ceil(total / PAGE_SIZE)}
        q={q}
      />
    </div>
  );
}
