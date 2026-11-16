import Link from "next/link";
import { requireTenantAdmin } from "@/lib/guards";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Pill, EmptyState } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { approveFlagAction } from "@/app/actions/moderation";
import { roleAtLeast } from "@/lib/tenant";
import {
  BanMemberButton,
  type MemberSubscriptionInfo,
} from "@/components/dashboard/ban-member-button";
import { RemoveFlagButton } from "./remove-flag-button";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.moderation");
  return { title: t("metaTitle") };
}

const CATEGORY_CLS: Record<string, string> = {
  spam: "bg-amber-50 text-amber-800",
  toxisch: "bg-red-50 text-red-700",
  belaestigung: "bg-red-50 text-red-700",
};

export default async function ModerationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, role } = await requireTenantAdmin(slug, "MODERATOR");
  const t = await getTranslations("dashboard.moderation");
  const tCat = await getTranslations("dashboard.moderation.categories");
  const locale = await getLocale();
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const [pending, resolved] = await Promise.all([
    prisma.moderationFlag.findMany({
      where: { tenantId: tenant.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.moderationFlag.findMany({
      where: { tenantId: tenant.id, status: { not: "PENDING" } },
      orderBy: { resolvedAt: "desc" },
      take: 10,
    }),
  ]);

  const authorIds = [...new Set(pending.map((f) => f.authorId).filter(Boolean))] as string[];
  const postIds = pending.filter((f) => f.refType === "Post").map((f) => f.refId);
  const commentIds = pending.filter((f) => f.refType === "Comment").map((f) => f.refId);

  const [authors, memberships, subscriptions, posts, comments] = await Promise.all([
    authorIds.length
      ? prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, email: true },
        })
      : [],
    authorIds.length
      ? prisma.membership.findMany({
          where: { tenantId: tenant.id, userId: { in: authorIds } },
          select: { id: true, userId: true, role: true, status: true },
        })
      : [],
    authorIds.length
      ? prisma.subscription.findMany({
          where: {
            tenantId: tenant.id,
            userId: { in: authorIds },
            status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
          },
          orderBy: { createdAt: "desc" },
          select: {
            userId: true,
            tier: { select: { name: true, priceCents: true, currency: true, interval: true } },
          },
        })
      : [],
    postIds.length
      ? prisma.post.findMany({
          where: { tenantId: tenant.id, id: { in: postIds } },
          select: { id: true, space: { select: { slug: true } } },
        })
      : [],
    commentIds.length
      ? prisma.comment.findMany({
          where: { tenantId: tenant.id, id: { in: commentIds } },
          select: { id: true, postId: true, post: { select: { space: { select: { slug: true } } } } },
        })
      : [],
  ]);
  const authorBy = new Map(authors.map((a) => [a.id, a]));
  const membershipBy = new Map(memberships.map((m) => [m.userId, m]));
  const subBy = new Map<string, MemberSubscriptionInfo>();
  for (const s of subscriptions) {
    if (subBy.has(s.userId) || s.tier.priceCents <= 0) continue;
    subBy.set(s.userId, {
      tierName: s.tier.name,
      priceCents: s.tier.priceCents,
      currency: s.tier.currency,
      interval: s.tier.interval,
    });
  }
  // Wo der Inhalt steht — damit man ihn im Zusammenhang lesen kann.
  const hrefBy = new Map<string, string>();
  for (const p of posts) hrefBy.set(`Post:${p.id}`, `/c/${slug}/s/${p.space.slug}/${p.id}`);
  for (const c of comments) {
    hrefBy.set(`Comment:${c.id}`, `/c/${slug}/s/${c.post.space.slug}/${c.postId}#comment-${c.id}`);
  }
  // Sperren ist Mitgliederverwaltung und damit Admin-Sache.
  const canBan = roleAtLeast(role, "ADMIN");

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {pending.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          hint={t("emptyHint")}
          icon="check"
        />
      ) : (
        <div className="space-y-3">
          {pending.map((f) => {
            const catCls = CATEGORY_CLS[f.category] ?? "bg-slate-100 text-slate-600";
            const catLabel = tCat.has(f.category) ? tCat(f.category) : f.category;
            const author = f.authorId ? authorBy.get(f.authorId) : undefined;
            const membership = f.authorId ? membershipBy.get(f.authorId) : undefined;
            const href = hrefBy.get(`${f.refType}:${f.refId}`);
            const banAllowed =
              canBan &&
              membership &&
              membership.role !== "OWNER" &&
              (role === "OWNER" || membership.role !== "ADMIN");
            return (
              <Card key={f.id}>
                <CardBody>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill className={catCls}>{catLabel}</Pill>
                    <Pill className="bg-slate-100 text-slate-600">
                      {f.refType === "Post" ? t("refPost") : t("refComment")}
                    </Pill>
                    {membership?.status === "BANNED" && (
                      <Pill className="bg-red-100 text-red-700">{t("authorBanned")}</Pill>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {author && !canBan ? (
                      // Moderatoren sehen die Mitgliederliste nicht — der Link
                      // fuehrte nur zurueck hierher.
                      <span className="font-semibold text-slate-900">{author.name}</span>
                    ) : author ? (
                      <Link
                        href={`/dashboard/${slug}/members?q=${encodeURIComponent(author.email)}`}
                        className="font-semibold text-slate-900 underline-offset-2 hover:underline"
                      >
                        {author.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-slate-900">{t("unknown")}</span>
                    )}
                    <span className="text-slate-500">
                      {" · "}
                      {dateFmt.format(f.createdAt)}
                      {" · "}
                      {f.source === "gemini" ? t("sourceAi") : t("sourceHeuristic")}: {f.reason}
                    </span>
                  </p>
                  <blockquote className="mt-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    „{f.excerpt}“
                  </blockquote>
                  {href && (
                    <Link
                      href={href}
                      target="_blank"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
                    >
                      <Icon name="external" size={14} />
                      {t("viewInContext")}
                    </Link>
                  )}
                  <div className="mt-3 flex flex-wrap items-start gap-2">
                    <form action={approveFlagAction}>
                      <input type="hidden" name="tenant" value={slug} />
                      <input type="hidden" name="id" value={f.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        {t("approve")}
                      </button>
                    </form>
                    <RemoveFlagButton
                      slug={slug}
                      flagId={f.id}
                      refType={f.refType === "Post" ? "Post" : "Comment"}
                      excerpt={f.excerpt}
                    />
                    {banAllowed && author && membership.status !== "BANNED" && (
                      <BanMemberButton
                        slug={slug}
                        membershipId={membership.id}
                        name={author.name}
                        community={tenant.name}
                        banned={false}
                        subscription={subBy.get(author.id) ?? null}
                        size="sm"
                        label={t("banAuthor", { name: author.name })}
                      />
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <Card className="mt-8">
          <CardBody>
            <h2 className="mb-2 text-sm font-bold text-slate-900">
              {t("recentDecisions")}
            </h2>
            <ul className="divide-y divide-slate-100">
              {resolved.map((f) => (
                <li key={f.id} className="flex items-center gap-2 py-2 text-sm">
                  <Pill
                    className={
                      f.status === "REMOVED"
                        ? "bg-red-50 text-red-700"
                        : "bg-emerald-50 text-emerald-700"
                    }
                  >
                    {f.status === "REMOVED" ? t("statusRemoved") : t("statusApproved")}
                  </Pill>
                  <span className="min-w-0 flex-1 truncate text-slate-500">
                    „{f.excerpt.slice(0, 80)}“
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {f.resolvedAt ? dateFmt.format(f.resolvedAt) : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
