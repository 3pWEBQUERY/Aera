import { requireTenantAdmin } from "@/lib/guards";
import { userTenants } from "@/lib/tenant";
import prisma from "@/lib/prisma";
import { CommunityRail } from "@/components/dashboard/community-rail";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { MobileDashboardNav } from "@/components/dashboard/mobile-nav";
import { TopHeader } from "@/components/dashboard/top-header";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { name: true },
  });
  if (!tenant) return {};
  return { title: `Dashboard — ${tenant.name}` };
}

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user } = await requireTenantAdmin(slug);
  const [tenants, spaces, membership] = await Promise.all([
    userTenants(user.id),
    prisma.space.findMany({
      where: { tenantId: tenant.id, isArchived: false },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true, type: true },
    }),
    prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      include: { tier: true },
    }),
  ]);

  // "Mein Abo" sheet data for the user menu.
  const subRow = membership
    ? await prisma.subscription.findFirst({
        where: { tenantId: tenant.id, userId: user.id, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const subscription = membership
    ? {
        tenantName: tenant.name,
        role: membership.role,
        memberSince: membership.joinedAt.toISOString(),
        tierName: membership.tier?.name ?? null,
        priceCents: membership.tier?.priceCents ?? 0,
        currency: membership.tier?.currency ?? "eur",
        interval: membership.tier?.interval ?? "FREE",
        subStatus: subRow?.status ?? null,
        cancelAtPeriodEnd: subRow?.cancelAtPeriodEnd ?? false,
        currentPeriodEnd: subRow?.currentPeriodEnd?.toISOString() ?? null,
      }
    : null;

  return (
    <div className="flex min-h-screen w-full bg-slate-50">
      {/* Far-left community rail (sticky, full height) */}
      <div className="sticky top-0 z-30 h-screen shrink-0 self-start">
        <CommunityRail
          activeSlug={tenant.slug}
          communities={tenants.map((t) => ({
            slug: t.slug,
            name: t.name,
            logoUrl: t.logoUrl,
            primaryColor: t.primaryColor,
          }))}
        />
      </div>

      {/* Navigation (sticky, full height) */}
      <div className="sticky top-0 hidden h-screen shrink-0 self-start md:block">
        <DashboardNav
          tenant={{
            slug: tenant.slug,
            name: tenant.name,
            logoUrl: tenant.logoUrl,
            primaryColor: tenant.primaryColor,
          }}
          spaces={spaces}
        />
      </div>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          slug={tenant.slug}
          user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl }}
          subscription={subscription}
          leading={
            <MobileDashboardNav
              tenant={{
                slug: tenant.slug,
                name: tenant.name,
                logoUrl: tenant.logoUrl,
                primaryColor: tenant.primaryColor,
              }}
              spaces={spaces}
            />
          }
        />
        <DashboardContent>{children}</DashboardContent>
      </div>
    </div>
  );
}
