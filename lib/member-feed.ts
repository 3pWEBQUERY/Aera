import "server-only";
import prisma, { withTenantContext } from "./prisma";
import { buildAccessContext, canAccess } from "./entitlements";
import { unlockedPostWhere } from "./post-access";
import { isAnnouncementsOnly } from "./space-settings";
import { excerpt } from "./utils";

/**
 * „Neu in deinen Communities“ auf /home: die letzten Beiträge und neu
 * angekündigten Events aus den Communities, in denen jemand Mitglied ist.
 *
 * Jede Community wird in ihrem eigenen Tenant-Kontext gelesen (RLS als zweite
 * Absicherung) und mit derselben Zugriffslogik gefiltert wie in der Community
 * selbst: nur Spaces, die die Person öffnen darf, nur Beiträge, die für sie
 * nicht gesperrt sind, nur veröffentlichte und keine geplanten. Gesperrtes
 * taucht hier gar nicht erst auf — auch nicht als Titel.
 */

export type MemberFeedItem =
  | {
      kind: "post";
      id: string;
      href: string;
      title: string;
      community: { name: string; logoUrl: string | null; primaryColor: string };
      spaceName: string;
      date: Date;
    }
  | {
      kind: "event";
      id: string;
      href: string;
      title: string;
      community: { name: string; logoUrl: string | null; primaryColor: string };
      spaceName: string;
      date: Date;
      startsAt: Date;
    };

const POST_SPACE_TYPES = ["FEED", "FORUM", "BLOG", "VIDEOS", "PODCAST", "MUSIC"] as const;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function memberFeed(
  userId: string,
  communities: { id: string; slug: string; name: string; logoUrl: string | null; primaryColor: string }[],
  limit = 8,
): Promise<MemberFeedItem[]> {
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_MS);

  const perTenant = await Promise.all(
    communities.slice(0, 8).map((c) =>
      withTenantContext(c.id, async (): Promise<MemberFeedItem[]> => {
        const ctx = await buildAccessContext(c.id, userId);
        if (ctx.membership?.status !== "ACTIVE") return [];
        const spaces = (
          await prisma.space.findMany({
            where: {
              tenantId: c.id,
              isArchived: false,
              type: { in: [...POST_SPACE_TYPES, "EVENTS"] },
            },
            select: {
              id: true,
              slug: true,
              name: true,
              type: true,
              visibility: true,
              requiredEntitlementKey: true,
              settings: true,
            },
          })
        ).filter((s) => !isAnnouncementsOnly(s.settings) && canAccess(s, ctx));
        const postSpaces = spaces.filter((s) => s.type !== "EVENTS");
        const eventSpaces = spaces.filter((s) => s.type === "EVENTS");
        const spaceById = new Map(spaces.map((s) => [s.id, s]));
        const community = { name: c.name, logoUrl: c.logoUrl, primaryColor: c.primaryColor };

        const [posts, events] = await Promise.all([
          postSpaces.length
            ? prisma.post.findMany({
                where: {
                  AND: [
                    {
                      tenantId: c.id,
                      spaceId: { in: postSpaces.map((s) => s.id) },
                      isPublished: true,
                      publishedAt: { lte: now, gte: since },
                      // Eigene Beiträge sind nicht „neu“ für die Person selbst.
                      authorId: { not: userId },
                    },
                    unlockedPostWhere(ctx),
                  ],
                },
                orderBy: { publishedAt: "desc" },
                take: 4,
                select: { id: true, title: true, body: true, publishedAt: true, spaceId: true },
              })
            : Promise.resolve([]),
          eventSpaces.length
            ? prisma.event.findMany({
                where: {
                  tenantId: c.id,
                  spaceId: { in: eventSpaces.map((s) => s.id) },
                  startsAt: { gte: now },
                  createdAt: { gte: since },
                  OR: [
                    { requiredEntitlementKey: null },
                    ...(ctx.keys.size
                      ? [{ requiredEntitlementKey: { in: [...ctx.keys] } }]
                      : []),
                  ],
                },
                orderBy: { createdAt: "desc" },
                take: 2,
                select: { id: true, title: true, startsAt: true, createdAt: true, spaceId: true },
              })
            : Promise.resolve([]),
        ]);

        return [
          ...posts.map((p): MemberFeedItem => {
            const space = spaceById.get(p.spaceId)!;
            return {
              kind: "post",
              id: p.id,
              href: `/c/${c.slug}/s/${space.slug}/${p.id}`,
              title: p.title || excerpt(p.body, 90),
              community,
              spaceName: space.name,
              date: p.publishedAt,
            };
          }),
          ...events.map((e): MemberFeedItem => {
            const space = spaceById.get(e.spaceId)!;
            return {
              kind: "event",
              id: e.id,
              href: `/c/${c.slug}/s/${space.slug}`,
              title: e.title,
              community,
              spaceName: space.name,
              date: e.createdAt,
              startsAt: e.startsAt,
            };
          }),
        ].filter((item) => item.title.trim().length > 0);
      }),
    ),
  );

  return perTenant
    .flat()
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, limit);
}
