import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { OrdersManager } from "@/components/admin/orders-manager";
import { AdminPagination } from "@/components/admin/pagination";
import type { Prisma } from "@/app/generated/prisma/client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("orders") };
}

const PAGE_SIZE = 30;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requirePlatformAdmin();
  const { q: qRaw, page: pageRaw } = await searchParams;
  const q = (qRaw ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number(pageRaw) || 1);

  const where: Prisma.OrderWhereInput = q
    ? { description: { contains: q, mode: "insensitive" } }
    : {};

  const [orders, total, paid] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        tenant: { select: { name: true, slug: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.aggregate({
      where: { status: "PAID" },
      _sum: { amountCents: true, platformFeeCents: true },
    }),
  ]);

  const rows = orders.map((o) => ({
    id: o.id,
    description: o.description,
    amountCents: o.amountCents,
    currency: o.currency,
    status: o.status as string,
    fulfilled: o.fulfilled,
    stripeSessionId: o.stripeSessionId,
    createdAt: o.createdAt.toISOString(),
    tenantName: o.tenant.name,
    tenantSlug: o.tenant.slug,
    userName: o.user.name,
    userEmail: o.user.email,
  }));

  return (
    <div className="space-y-6">
      <OrdersManager
        rows={rows}
        total={total}
        q={q}
        stats={{
          total,
          paidAmountCents: paid._sum.amountCents ?? 0,
          paidFeeCents: paid._sum.platformFeeCents ?? 0,
        }}
      />
      <AdminPagination
        basePath="/admin/orders"
        page={page}
        pageCount={Math.ceil(total / PAGE_SIZE)}
        q={q}
      />
    </div>
  );
}
