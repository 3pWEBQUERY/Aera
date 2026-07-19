import prisma from "@/lib/prisma";
import { buildAccessContext, canAccess, type AccessContext } from "@/lib/entitlements";
import { isAnnouncementsOnly } from "@/lib/space-settings";
import { jsonError, jsonOk, mobileAuth } from "@/lib/mobile/api";
import {
  communityCoverMap,
  toCommunityCard,
  toPostDto,
  type CommunityCardDto,
  type PostDto,
  type PostEngagement,
} from "@/lib/mobile/serializers";
import type { Role, SpaceType } from "@/app/generated/prisma/client";

// GET /api/mobile/v1/home?tab=home|members&cursor=&limit=
//   → { data: [{ community: CommunityCard, post: Post }], nextCursor }
// Aggregierter Content-Feed über Tenants hinweg, absteigend nach publishedAt.
// tab=home: alle Tenants (Token optional). tab=members: nur Tenants mit
// ACTIVE-Membership des Users (ohne Token → 401).
//
// Läuft bewusst OHNE Tenant-RLS-Kontext (Cross-Tenant-Query auf der
// privilegierten Connection, siehe lib/prisma.ts); die Zugriffskontrolle
// passiert pro beteiligtem Tenant über buildAccessContext + canAccess:
// nicht zugängliche Spaces ⇒ Post locked + Felder genullt (toPostDto
// forceLocked), Pay-per-Post-Gating wie überall via isPostLocked.

const FEED_SPACE_TYPES: SpaceType[] = ["FEED", "FORUM", "BLOG", "VIDEOS", "PODCAST"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") === "members" ? "members" : "home";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 50);
  const cursor = url.searchParams.get("cursor")?.trim() || null;

  const user = await mobileAuth(req);
  if (tab === "members" && !user) {
    return jsonError("unauthorized", "Missing or invalid bearer token.", 401);
  }

  // Eigene aktive Mitgliedschaften: isMember-Flag + Tenant-Filter für tab=members.
  const myMemberships = user
    ? await prisma.membership.findMany({
        where: {
          userId: user.id,
          status: "ACTIVE",
          tenant: { status: "ACTIVE" },
        },
        select: { tenantId: true },
      })
    : [];
  const myTenantIds = new Set(myMemberships.map((m) => m.tenantId));

  if (tab === "members" && myTenantIds.size === 0) {
    return jsonOk({ data: [], nextCursor: null });
  }

  // Keyset-Cursor (publishedAt+id, stabil auch bei neuen Posts während des Scrollens).
  let cursorFilter = {};
  if (cursor) {
    const cursorPost = await prisma.post.findUnique({
      where: { id: cursor },
      select: { id: true, publishedAt: true },
    });
    if (!cursorPost) return jsonError("validation", "cursor: Unknown cursor.", 400);
    cursorFilter = {
      OR: [
        { publishedAt: { lt: cursorPost.publishedAt } },
        { publishedAt: cursorPost.publishedAt, id: { lt: cursorPost.id } },
      ],
    };
  }

  const now = new Date();
  const rows = await prisma.post.findMany({
    where: {
      isPublished: true,
      publishedAt: { lte: now },
      tenant: { status: "ACTIVE" },
      space: { type: { in: FEED_SPACE_TYPES }, isArchived: false },
      ...(tab === "members" ? { tenantId: { in: [...myTenantIds] } } : {}),
      ...cursorFilter,
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { comments: true } },
      space: true,
      tenant: true,
    },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  // Banner-Container-Spaces liefern nie Feed-Inhalte (wie visibleSpaces im Web).
  const visible = page.filter((p) => !isAnnouncementsOnly(p.space.settings));

  // ---------------------------------------------------------------- Batches
  const tenantIds = [...new Set(visible.map((p) => p.tenantId))];
  const postIds = visible.map((p) => p.id);
  const forumIds = visible.filter((p) => p.space.type === "FORUM").map((p) => p.id);
  const authorIds = [...new Set(visible.map((p) => p.author.id))];

  // Pro beteiligtem Tenant genau ein Zugriffskontext (für Gäste ohne Query).
  const ctxByTenant = new Map<string, AccessContext>(
    await Promise.all(
      tenantIds.map(async (tid): Promise<[string, AccessContext]> => [
        tid,
        await buildAccessContext(tid, user?.id ?? null),
      ]),
    ),
  );

  const [covers, memberGroups, authorRoles, likeGroups, myLikes, voteGroups, myVotes] =
    await Promise.all([
      communityCoverMap(tenantIds),
      tenantIds.length
        ? prisma.membership.groupBy({
            by: ["tenantId"],
            where: { tenantId: { in: tenantIds }, status: "ACTIVE" },
            _count: true,
          })
        : Promise.resolve([]),
      // Autoren-Rollen über alle beteiligten Tenants in einer Query (statt
      // roleMapFor je Tenant); Zuordnung danach tenant-spezifisch.
      authorIds.length
        ? prisma.membership.findMany({
            where: {
              tenantId: { in: tenantIds },
              userId: { in: authorIds },
              status: "ACTIVE",
            },
            select: { tenantId: true, userId: true, role: true },
          })
        : Promise.resolve([]),
      // Engagement cross-tenant gebatcht (Post-IDs sind global eindeutig).
      postIds.length
        ? prisma.reaction.groupBy({
            by: ["postId"],
            where: { postId: { in: postIds }, type: "LIKE" },
            _count: true,
          })
        : Promise.resolve([]),
      user && postIds.length
        ? prisma.reaction.findMany({
            where: { userId: user.id, postId: { in: postIds }, type: "LIKE" },
            select: { postId: true },
          })
        : Promise.resolve([]),
      forumIds.length
        ? prisma.reaction.groupBy({
            by: ["postId", "type"],
            where: { postId: { in: forumIds }, type: { in: ["UP", "DOWN"] } },
            _count: true,
          })
        : Promise.resolve([]),
      user && forumIds.length
        ? prisma.reaction.findMany({
            where: { userId: user.id, postId: { in: forumIds }, type: { in: ["UP", "DOWN"] } },
            select: { postId: true, type: true },
          })
        : Promise.resolve([]),
    ]);

  const memberCounts = new Map<string, number>();
  for (const g of memberGroups) memberCounts.set(g.tenantId, g._count as number);

  // Rollen je Tenant als eigene Map (toAuthor erwartet Map<userId, Role>).
  const rolesByTenant = new Map<string, Map<string, Role>>();
  for (const r of authorRoles) {
    let m = rolesByTenant.get(r.tenantId);
    if (!m) {
      m = new Map();
      rolesByTenant.set(r.tenantId, m);
    }
    m.set(r.userId, r.role);
  }

  const engagement: PostEngagement = {
    likeCounts: new Map(),
    likedByMe: new Set(),
    scores: new Map(),
    myVotes: new Map(),
  };
  for (const g of likeGroups) {
    if (g.postId) engagement.likeCounts.set(g.postId, g._count as number);
  }
  for (const r of myLikes) if (r.postId) engagement.likedByMe.add(r.postId);
  for (const g of voteGroups) {
    if (!g.postId) continue;
    engagement.scores.set(
      g.postId,
      (engagement.scores.get(g.postId) ?? 0) +
        (g.type === "UP" ? 1 : -1) * (g._count as number),
    );
  }
  for (const v of myVotes) {
    if (v.postId) engagement.myVotes.set(v.postId, v.type as "UP" | "DOWN");
  }

  // ---------------------------------------------------------------- Serialize
  const emptyRoles = new Map<string, Role>();
  const cardByTenant = new Map<string, CommunityCardDto>();
  const data: Array<{ community: CommunityCardDto; post: PostDto }> = [];
  for (const row of visible) {
    let community = cardByTenant.get(row.tenantId);
    if (!community) {
      community = toCommunityCard(row.tenant, {
        coverUrl: covers.get(row.tenantId) ?? null,
        memberCount: memberCounts.get(row.tenantId) ?? 0,
        isMember: myTenantIds.has(row.tenantId),
      });
      cardByTenant.set(row.tenantId, community);
    }
    const ctx = ctxByTenant.get(row.tenantId)!;
    // Space-Gate wie die Web-Space-Page: nicht zugänglich ⇒ Post gesperrt
    // (Felder genullt), zusätzlich greift das Pay-per-Post-Gating in toPostDto.
    const spaceAccessible = canAccess(row.space, ctx);
    data.push({
      community,
      post: toPostDto(
        row,
        row.space,
        ctx,
        rolesByTenant.get(row.tenantId) ?? emptyRoles,
        engagement,
        { forceLocked: !spaceAccessible },
      ),
    });
  }

  return jsonOk({
    data,
    nextCursor: hasMore && page.length ? page[page.length - 1]!.id : null,
  });
}
