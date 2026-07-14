import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { HomeRail, type RailMembership } from "@/components/home/home-rail";
import { VerifyEmailBanner } from "@/components/verify-email-banner";

export const metadata: Metadata = {
  title: "Entdecken — Aera",
  description: "Finde Communities und Creator auf Aera.",
};

export default async function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const memberships: RailMembership[] = user
    ? (
        await prisma.membership.findMany({
          where: { userId: user.id, status: "ACTIVE" },
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

  return (
    <div className="flex min-h-screen bg-[#f4f1ea]">
      <HomeRail
        memberships={memberships}
        user={user ? { name: user.name, avatarUrl: user.avatarUrl } : null}
      />
      <main className="min-w-0 flex-1">
        {user && !user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}
        {children}
      </main>
    </div>
  );
}
