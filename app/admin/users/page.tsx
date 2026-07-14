import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { UsersManager } from "@/components/admin/users-manager";
import { AdminPagination } from "@/components/admin/pagination";
import type { Prisma } from "@/app/generated/prisma/client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("users") };
}

const PAGE_SIZE = 30;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requirePlatformAdmin();
  const { q: qRaw, page: pageRaw } = await searchParams;
  const q = (qRaw ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number(pageRaw) || 1);

  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
        _count: { select: { memberships: true, orders: true, ownedTenants: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt.toISOString(),
    memberships: u._count.memberships,
    orders: u._count.orders,
    ownedTenants: u._count.ownedTenants,
  }));

  return (
    <div className="space-y-6">
      <UsersManager rows={rows} total={total} q={q} />
      <AdminPagination
        basePath="/admin/users"
        page={page}
        pageCount={Math.ceil(total / PAGE_SIZE)}
        q={q}
      />
    </div>
  );
}
