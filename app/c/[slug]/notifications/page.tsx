import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommunityContext } from "@/lib/guards";
import {
  listNotifications,
  markAllNotificationsRead,
  type NotificationRow,
} from "@/lib/notifications";
import { Card, CardBody } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { getLocale, getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { canAccess } from "@/lib/entitlements";
import { isPostLocked } from "@/lib/post-access";
import { ButtonLink } from "@/components/ui/button";
import { excerpt, formatDateTime, timeAgo } from "@/lib/utils";
import type { Metadata } from "next";
import { tenantPageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations("notifications");
  // Persoenlich: kein canonical, kein Index.
  return tenantPageMetadata(slug, { title: t("title"), path: null, noindex: true });
}

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, user, ctx } = community;
  const [t, locale] = await Promise.all([
    getTranslations("notifications"),
    getLocale(),
  ]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-[#161613]">{t("loginTitle")}</h1>
        <p className="mt-2 text-sm text-[#161613]/70">{t("loginHint")}</p>
        <div className="mt-6">
          <ButtonLink
            href={`/login?next=${encodeURIComponent(`/c/${slug}/notifications`)}`}
            variant="primary"
            size="lg"
            className="rounded-xl"
          >
            {t("loginCta")}
          </ButtonLink>
        </div>
      </div>
    );
  }

  const rows = await listNotifications(tenant.id, user.id, 50);

  // Worum geht es? Den Beitrag zu jeder Benachrichtigung nachschlagen — über
  // refType/refId, damit auch ältere Einträge ihren Kontext bekommen. Ein
  // Auszug aus dem Text nur, wenn der Beitrag für die Person nicht gesperrt
  // ist; sonst höchstens der Titel.
  const commentIds = rows.filter((r) => r.refType === "Comment" && r.refId).map((r) => r.refId!);
  const postIds = rows.filter((r) => r.refType === "Post" && r.refId).map((r) => r.refId!);
  const [refComments, refPosts] = await Promise.all([
    commentIds.length
      ? prisma.comment.findMany({
          where: { tenantId: tenant.id, id: { in: commentIds } },
          select: { id: true, postId: true },
        })
      : Promise.resolve([]),
    postIds.length
      ? prisma.post.findMany({
          where: { tenantId: tenant.id, id: { in: postIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);
  const postIdOfComment = new Map(refComments.map((c) => [c.id, c.postId]));
  const allPostIds = [...new Set([...refComments.map((c) => c.postId), ...refPosts.map((p) => p.id)])];
  const posts = allPostIds.length
    ? await prisma.post.findMany({
        where: { tenantId: tenant.id, id: { in: allPostIds } },
        select: {
          id: true,
          title: true,
          body: true,
          visibility: true,
          priceCents: true,
          entitlementKey: true,
          space: { select: { visibility: true, requiredEntitlementKey: true } },
        },
      })
    : [];
  const postLabel = new Map(
    posts.map((p) => {
      const readable = canAccess(p.space, ctx) && !isPostLocked(p, ctx);
      return [p.id, p.title?.trim() || (readable ? excerpt(p.body, 50) : "")] as const;
    }),
  );
  const labelFor = (n: NotificationRow): string => {
    if (!n.refId) return "";
    const postId = n.refType === "Comment" ? postIdOfComment.get(n.refId) : n.refId;
    return (postId && postLabel.get(postId)) || "";
  };

  // Gespeichert ist ein deutscher Text; angezeigt wird aus Typ, Ziel und
  // Auslöser, damit jede Sprache ihre eigene Formulierung bekommt. Ein Like
  // auf einen Kommentar ist REACTION mit refType "Comment" — ohne neues Enum.
  const notificationText = (n: NotificationRow): string => {
    if (!n.actor) return n.message;
    const key =
      n.type === "REACTION" && n.refType === "Comment" ? "REACTION_COMMENT" : n.type;
    const title = labelFor(n);
    return title
      ? t(`itemsWithTitle.${key}`, { actor: n.actor.name, title })
      : t(`items.${key}`, { actor: n.actor.name });
  };
  // Ansehen gilt als Lesen — idempotent, doppelte Ausführung ist harmlos.
  await markAllNotificationsRead(tenant.id, user.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
          <Icon name="bell" size={20} />
        </span>
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardBody>
            <p className="py-6 text-center text-sm text-slate-600">{t("empty")}</p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {rows.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href}
                  className={`flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50 ${
                    n.readAt ? "" : "bg-[var(--brand-soft,#f8fafc)]"
                  }`}
                >
                  <Avatar
                    name={n.actor?.name ?? "Aera"}
                    src={n.actor?.avatarUrl ?? null}
                    size={36}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-800">{notificationText(n)}</span>
                    <time
                      dateTime={n.createdAt.toISOString()}
                      title={formatDateTime(n.createdAt, locale)}
                      className="mt-0.5 block text-xs text-slate-600"
                    >
                      {timeAgo(n.createdAt, locale)}
                    </time>
                  </span>
                  {!n.readAt && (
                    <span
                      aria-label={t("unread")}
                      className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]"
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
