import { requireTenantAdmin } from "@/lib/guards";
import { AERA_DASHBOARD_VARS } from "@/lib/ui-theme";
import { userTenants } from "@/lib/tenant";
import prisma from "@/lib/prisma";
import { CommunityRail } from "@/components/dashboard/community-rail";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { MobileDashboardNav } from "@/components/dashboard/mobile-nav";
import { TopHeader } from "@/components/dashboard/top-header";
import { ModeratorNav } from "@/components/dashboard/moderator-nav";
import { getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { CREATOR_CLIENT_NAMESPACES, clientMessages } from "@/i18n/client-messages";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import type { Metadata } from "next";
import { PLATFORM_CURRENCY } from "@/lib/currency";
import { getTenantPlan } from "@/lib/plan";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { slug, status: "ACTIVE" },
    select: { name: true },
  });
  if (!tenant) return {};
  // "{Seite} – {Community}": jede Dashboard-Seite setzt nur ihren Namen, das
  // Template haengt die Community an. `absolute`, damit das Root-Template
  // ("— Aera") nicht noch einmal angehaengt wird.
  return {
    title: {
      absolute: `Dashboard – ${tenant.name}`,
      template: `%s – ${tenant.name}`,
    },
    robots: { index: false, follow: false },
  };
}

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // MODERATOR genuegt fuer die Huelle; jede Seite ausser der Moderation
  // verlangt selbst ADMIN und schickt Moderatoren dorthin zurueck.
  const { tenant, user, role } = await requireTenantAdmin(slug, "MODERATOR");
  const isModerator = role === "MODERATOR";
  const [tenants, spaces, membership, plan] = await Promise.all([
    userTenants(user.id, { includeModerator: true }),
    prisma.space.findMany({
      where: { tenantId: tenant.id, isArchived: false },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true, type: true },
    }),
    prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      include: { tier: true },
    }),
    // Drives the lock badges in the navigation.
    getTenantPlan(tenant.id),
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
        currency: membership.tier?.currency ?? PLATFORM_CURRENCY,
        interval: membership.tier?.interval ?? "FREE",
        subStatus: subRow?.status ?? null,
        cancelAtPeriodEnd: subRow?.cancelAtPeriodEnd ?? false,
        currentPeriodEnd: subRow?.currentPeriodEnd?.toISOString() ?? null,
      }
    : null;

  const navTenant = {
    slug: tenant.slug,
    name: tenant.name,
    logoUrl: tenant.logoUrl,
    primaryColor: tenant.primaryColor,
  };
  const tModeration = await getTranslations("dashboard.moderation");

  // Dashboard-Texte nur hier an den Browser geben (siehe i18n/client-messages.ts).
  const clientMsgs = await clientMessages(CREATOR_CLIENT_NAMESPACES);

  return (
    <NextIntlClientProvider messages={clientMsgs}>
    <div className="flex min-h-screen w-full bg-slate-50" style={AERA_DASHBOARD_VARS}>
      {/* Far-left community rail (sticky, full height). Hidden on phones,
          where it took a fifth of the width; the menu sheet links to all
          communities instead. */}
      <div className="sticky top-0 z-30 hidden h-screen shrink-0 self-start sm:block">
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
        {isModerator ? (
          <ModeratorNav tenant={navTenant} />
        ) : (
        <DashboardNav
          tenant={{
            slug: tenant.slug,
            name: tenant.name,
            logoUrl: tenant.logoUrl,
            primaryColor: tenant.primaryColor,
          }}
          spaces={spaces}
          plan={plan}
        />
        )}
      </div>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}
        <TopHeader
          slug={tenant.slug}
          user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl }}
          subscription={subscription}
          hideSearch={isModerator}
          leading={
            isModerator ? (
              <span className="truncate text-sm font-semibold text-slate-900 md:hidden">
                {tenant.name} · {tModeration("title")}
              </span>
            ) : (
            <MobileDashboardNav
              tenant={{
                slug: tenant.slug,
                name: tenant.name,
                logoUrl: tenant.logoUrl,
                primaryColor: tenant.primaryColor,
              }}
              spaces={spaces}
              plan={plan}
            />
            )
          }
        />
        <DashboardContent>{children}</DashboardContent>
      </div>
    </div>
    </NextIntlClientProvider>
  );
}
