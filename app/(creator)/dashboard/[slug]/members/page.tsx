import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import { MembersManager, type MemberRow } from "@/components/dashboard/members-manager";

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const { tenant, user } = await requireTenantAdmin(slug);

  const [memberships, tiers] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId: tenant.id },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: { name: true, email: true, avatarUrl: true } } },
    }),
    prisma.membershipTier.findMany({
      where: { tenantId: tenant.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const members: MemberRow[] = memberships.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
    tierId: m.tierId,
    user: m.user,
  }));

  return (
    <MembersManager
      slug={slug}
      members={members}
      tiers={tiers}
      currentUserId={user.id}
      initialTab={tab}
    />
  );
}
