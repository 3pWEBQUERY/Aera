import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { HomeRail, type RailMembership } from "@/components/home/home-rail";
import { MobileTabbar } from "@/components/home/mobile-tabbar";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { getTranslations } from "next-intl/server";
import { getPlatformSeo } from "@/lib/seo";

// Titel und Beschreibung fuer alle Entdecken-Seiten; canonical setzt jede
// Seite selbst (/home bzw. /home/search).
export async function generateMetadata(): Promise<Metadata> {
  const [t, seo] = await Promise.all([getTranslations("marketing.seo"), getPlatformSeo()]);
  return {
    // Mit Template, sonst verloeren Unterseiten wie /home/search das "— Aera".
    title: { default: t("discoverTitle"), template: seo.titleTemplate },
    description: t("discoverDescription"),
  };
}

export default async function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const memberships: RailMembership[] = user
    ? (
        await prisma.membership.findMany({
          where: {
            userId: user.id,
            status: "ACTIVE",
            tenant: { status: "ACTIVE" },
          },
          orderBy: { joinedAt: "desc" },
          take: 8,
          include: {
            tenant: {
              select: { slug: true, name: true, logoUrl: true, primaryColor: true },
            },
          },
        })
      ).map((m) => m.tenant)
    : [];
  // Creator-Bereich nur für Inhaber und Team, nicht für reine Mitglieder.
  const isCreator = user
    ? (await prisma.membership.count({
        where: {
          userId: user.id,
          status: "ACTIVE",
          role: { in: ["OWNER", "ADMIN", "MODERATOR"] },
          tenant: { status: "ACTIVE" },
        },
      })) > 0
    : false;

  return (
    <div className="flex min-h-screen bg-[#f4f1ea]">
      <HomeRail
        memberships={memberships}
        user={user ? { name: user.name, avatarUrl: user.avatarUrl } : null}
        isCreator={isCreator}
      />
      {/* pb-28: Freiraum für die schwebende Mobile-Tabbar. */}
      <main className="min-w-0 flex-1 pb-28 md:pb-0">
        {user && !user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}
        {children}
      </main>
      <MobileTabbar
        user={user ? { name: user.name, avatarUrl: user.avatarUrl } : null}
      />
    </div>
  );
}
