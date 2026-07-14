import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getCommunityContext } from "@/lib/guards";
import { ensureReferralCode } from "@/lib/referrals";
import { env } from "@/lib/env";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { InviteFriends } from "@/components/community/invite-friends";

const ROLE_META: Record<string, { key: string; cls: string }> = {
  OWNER: {
    key: "roleCreator",
    cls: "bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]",
  },
  ADMIN: { key: "roleAdmin", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  MODERATOR: { key: "roleMod", cls: "bg-sky-50 text-sky-700 ring-1 ring-sky-200" },
};

const roleRank: Record<string, number> = { OWNER: 0, ADMIN: 1, MODERATOR: 2, MEMBER: 3 };

export default async function CommunityMembers({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, ctx, user } = community;
  const t = await getTranslations("community.members");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale);
  const joinedLabel = (d: Date) =>
    d.toLocaleDateString(locale, { month: "long", year: "numeric" });

  // Member directory is members-only (names/avatars are personal data).
  if (ctx.membership?.status !== "ACTIVE" && !ctx.isStaff) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
          <Icon name="lock" size={24} />
        </span>
        <h1 className="text-xl font-bold text-slate-900">{t("lockedTitle")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("lockedText")}</p>
      </div>
    );
  }

  const members = await prisma.membership.findMany({
    where: { tenantId: tenant.id, status: "ACTIVE" },
    orderBy: { joinedAt: "asc" },
    include: {
      user: { select: { name: true, avatarUrl: true } },
      tier: { select: { name: true } },
    },
  });

  // Gamification stats (points / level) for a richer card — optional per member.
  const statRows = await prisma.memberStats.findMany({
    where: { tenantId: tenant.id, userId: { in: members.map((m) => m.userId) } },
    select: { userId: true, points: true, levelName: true },
  });
  const statBy = new Map(statRows.map((s) => [s.userId, s]));

  // Staff first, then founding members (oldest join) first.
  const ordered = [...members].sort(
    (a, b) =>
      (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9) ||
      a.joinedAt.getTime() - b.joinedAt.getTime(),
  );

  // Persönlicher Einladungs-Link (Referral-Programm) für aktive Mitglieder.
  const referralCode = user ? await ensureReferralCode(tenant.id, user.id) : null;
  const inviteUrl = referralCode
    ? `${env.APP_URL}/c/${slug}/join?ref=${referralCode}`
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {inviteUrl && <InviteFriends inviteUrl={inviteUrl} />}
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
          <Icon name="members" size={22} />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-500">
            {t("countInCommunity", { count: members.length })}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((m) => {
          const role = ROLE_META[m.role];
          const stat = statBy.get(m.userId);
          const isMe = m.userId === user?.id;
          return (
            <div
              key={m.id}
              className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Avatar name={m.user.name} src={m.user.avatarUrl} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-semibold text-slate-900">{m.user.name}</p>
                    {isMe && (
                      <span className="shrink-0 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        {t("youBadge")}
                      </span>
                    )}
                    {role && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${role.cls}`}
                      >
                        {t(role.key)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {t("memberSince", { date: joinedLabel(m.joinedAt) })}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <span className="inline-flex max-w-[55%] items-center gap-1.5 truncate text-xs font-medium text-slate-500">
                  <Icon name="tiers" size={13} className="shrink-0 text-slate-300" />
                  <span className="truncate">{m.tier?.name ?? t("freeTier")}</span>
                </span>
                {stat && stat.points > 0 ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs">
                    {stat.levelName && (
                      <span className="text-slate-400">{stat.levelName}</span>
                    )}
                    <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 font-semibold text-[color:var(--brand)]">
                      {nf.format(stat.points)} {t("pts")}
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-slate-300">{t("newHere")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
