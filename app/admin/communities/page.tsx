import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { CommunitiesManager } from "@/components/admin/communities-manager";
import { AdminPagination } from "@/components/admin/pagination";
import type { Prisma } from "@/app/generated/prisma/client";
import { PLAN_ORDER } from "@/lib/credit-plans";
import type { PlanKey } from "@/lib/plan-features";
import { env } from "@/lib/env";

const STATUSES = ["ACTIVE", "SUSPENDED", "DELETING"] as const;
type TenantStatus = (typeof STATUSES)[number];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("communities") };
}

const PAGE_SIZE = 30;

export default async function AdminCommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string; plan?: string }>;
}) {
  await requirePlatformAdmin();
  const { q: qRaw, page: pageRaw, status: statusRaw, plan: planRaw } = await searchParams;
  const q = (qRaw ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number(pageRaw) || 1);
  // Unbekannte Werte aus der URL zaehlen als „Alle".
  const status = STATUSES.find((s) => s === statusRaw) as TenantStatus | undefined;
  const plan = PLAN_ORDER.find((p) => p === planRaw) as PlanKey | undefined;

  const and: Prisma.TenantWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
        { tagline: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (status) and.push({ status });
  if (plan) {
    // Ohne Wallet gilt eine Community als FREE (siehe creatorPlan unten).
    and.push(
      plan === "FREE"
        ? { OR: [{ aiCreditWallet: { is: null } }, { aiCreditWallet: { is: { plan } } }] }
        : { aiCreditWallet: { is: { plan } } },
    );
  }
  const where: Prisma.TenantWhereInput = and.length ? { AND: and } : {};

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        _count: { select: { memberships: true, posts: true, orders: true } },
        owner: { select: { name: true, email: true } },
        // Das Paket haengt an der Wallet, nicht am Tenant. Fehlt sie noch
        // (frisch angelegte Community), gilt FREE.
        aiCreditWallet: {
          select: { plan: true, planSource: true, creatorSubscriptionStatus: true },
        },
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
    customDomainVerifiedAt: t.customDomainVerifiedAt?.toISOString() ?? null,
    platformFeePercent: t.platformFeePercent,
    status: t.status,
    // `category` is new in the schema; the generated client may be older.
    category: (t as { category?: string | null }).category ?? null,
    createdAt: t.createdAt.toISOString(),
    ownerName: t.owner.name,
    ownerEmail: t.owner.email,
    members: t._count.memberships,
    posts: t._count.posts,
    orders: t._count.orders,
    creatorPlan: t.aiCreditWallet?.plan ?? "FREE",
    planSource: t.aiCreditWallet?.planSource ?? "DEFAULT",
    // Ein laufendes Stripe-Abo sperrt das Feld: Billing hat Vorrang.
    billingLocked:
      t.aiCreditWallet?.planSource === "STRIPE" &&
      (t.aiCreditWallet?.creatorSubscriptionStatus === "ACTIVE" ||
        t.aiCreditWallet?.creatorSubscriptionStatus === "TRIALING"),
  }));

  return (
    <div className="space-y-6">
      <CommunitiesManager
        rows={rows}
        total={total}
        q={q}
        status={status ?? ""}
        plan={plan ?? ""}
        rootDomain={env.ROOT_DOMAIN}
      />
      <AdminPagination
        basePath="/admin/communities"
        page={page}
        pageCount={Math.ceil(total / PAGE_SIZE)}
        q={q}
        params={{ status: status ?? "", plan: plan ?? "" }}
      />
    </div>
  );
}
