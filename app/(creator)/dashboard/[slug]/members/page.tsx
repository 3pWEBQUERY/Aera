import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import { parseBadgeCriteria } from "@/lib/badges";
import {
  MembersManager,
  type MemberRow,
  type BadgeOption,
} from "@/components/dashboard/members-manager";
import type { MemberSubscriptionInfo } from "@/components/dashboard/ban-member-button";

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

  const [memberships, tiers, badges, awards, subscriptions] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId: tenant.id },
      orderBy: { joinedAt: "asc" },
      include: {
        user: {
          select: { name: true, email: true, avatarUrl: true, emailVerifiedAt: true, createdAt: true },
        },
      },
    }),
    prisma.membershipTier.findMany({
      where: { tenantId: tenant.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.badge.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, description: true, criteria: true },
    }),
    prisma.badgeAward.findMany({
      where: { tenantId: tenant.id },
      select: { badgeId: true, userId: true, awardedAt: true },
    }),
    // Laufende bezahlte Abos — der Sperren-Dialog nennt, was gekündigt wird.
    prisma.subscription.findMany({
      where: { tenantId: tenant.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      orderBy: { createdAt: "desc" },
      select: {
        userId: true,
        tier: { select: { name: true, priceCents: true, currency: true, interval: true } },
      },
    }),
  ]);
  const subByUser = new Map<string, MemberSubscriptionInfo>();
  for (const sub of subscriptions) {
    if (subByUser.has(sub.userId) || sub.tier.priceCents <= 0) continue;
    subByUser.set(sub.userId, {
      tierName: sub.tier.name,
      priceCents: sub.tier.priceCents,
      currency: sub.tier.currency,
      interval: sub.tier.interval,
    });
  }

  const badgeOptions: BadgeOption[] = badges.map((b) => {
    const c = parseBadgeCriteria(b.criteria);
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      shape: c.shape,
      tier: c.tier,
      icon: c.icon,
      type: c.type,
      threshold: c.threshold,
    };
  });

  // Die Vergaben je Mitglied vorsortieren — die Liste soll sie zeigen, ohne
  // dass jede Zeile die Gesamtmenge durchsucht.
  const byUser = new Map<string, { badgeId: string; awardedAt: Date }[]>();
  for (const a of awards) {
    const list = byUser.get(a.userId);
    if (list) list.push({ badgeId: a.badgeId, awardedAt: a.awardedAt });
    else byUser.set(a.userId, [{ badgeId: a.badgeId, awardedAt: a.awardedAt }]);
  }

  const members: MemberRow[] = memberships.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
    tierId: m.tierId,
    user: { name: m.user.name, email: m.user.email, avatarUrl: m.user.avatarUrl },
    badges: byUser.get(m.userId) ?? [],
    // „Eingeladen“: Konto und Mitgliedschaft entstanden in derselben
    // Einladung (Mitglied hinzufügen), und die Einladung wurde noch nicht
    // angenommen — das Annehmen bestätigt die E-Mail-Adresse.
    invited:
      !m.user.emailVerifiedAt &&
      Math.abs(m.joinedAt.getTime() - m.user.createdAt.getTime()) < 10_000,
    subscription: subByUser.get(m.userId) ?? null,
  }));

  return (
    <MembersManager
      slug={slug}
      communityName={tenant.name}
      members={members}
      tiers={tiers}
      badges={badgeOptions}
      currentUserId={user.id}
      initialTab={tab}
    />
  );
}
