import "server-only";
import prisma from "@/lib/prisma";
import {
  buildAccessContext,
  canAccess,
  type AccessContext,
} from "@/lib/entitlements";
import { unreadNotificationCount } from "@/lib/notifications";
import { isLessonUnlocked, daysUntilUnlock } from "@/lib/drip";
import {
  parseBlogSettings,
  parseSpaceLinks,
  activeAnnouncements,
  isAnnouncementsOnly,
} from "@/lib/space-settings";
import { CATEGORIES } from "@/lib/categories";
import { excerpt } from "@/lib/utils";
import {
  productAppleProductId,
  tierAppleProductId,
  tipPresets,
  unlockAppleProductId,
} from "@/lib/apple-products";
import type {
  Membership,
  MembershipTier,
  Role,
  Space,
  SpaceType,
  Tenant,
  User,
} from "@/app/generated/prisma/client";

/**
 * DTO-Serialisierer für die Mobile-API — Feld-Shapes exakt nach
 * Aera-visitor-member-iOS-App/docs/API-CONTRACT.md. Gated Content wird hier
 * serverseitig genullt (nie nur clientseitig versteckt); die Gate-Logik
 * spiegelt app/c/[slug]/s/[spaceSlug]/page.tsx bzw. lib/entitlements.ts.
 */

// ================================================================ Shared shapes
export interface UserDto {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  totpEnabled: boolean;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    emailVerified: Boolean(user.emailVerifiedAt),
    totpEnabled: Boolean(user.totpEnabledAt),
  };
}

export interface AuthorDto {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: Role | null;
}

/** Rollen der Autoren im Tenant, gebatcht (eine Query pro Liste). */
export async function roleMapFor(
  tenantId: string,
  userIds: string[],
): Promise<Map<string, Role>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const rows = await prisma.membership.findMany({
    where: { tenantId, userId: { in: unique } },
    select: { userId: true, role: true },
  });
  return new Map(rows.map((r) => [r.userId, r.role]));
}

export function toAuthor(
  user: { id: string; name: string; avatarUrl: string | null },
  roles: Map<string, Role>,
): AuthorDto {
  return {
    userId: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: roles.get(user.id) ?? null,
  };
}

export interface UnlockDto {
  priceCents: number;
  currency: string;
  appleProductId: string | null;
  kind: "post" | "media" | "media-item" | "product" | "request" | "booking";
  refId: string;
}

/** Unlock-Objekt für ein gesperrtes Objekt; appleProductId aus dem Preis-Pool. */
export function unlockDto(
  kind: UnlockDto["kind"],
  refId: string,
  priceCents: number,
  currency: string,
): UnlockDto {
  return {
    priceCents,
    currency,
    appleProductId: unlockAppleProductId(priceCents),
    kind,
    refId,
  };
}

// ================================================================ Community card
export interface CommunityCardDto {
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  primaryColor: string;
  accentColor: string;
  category: string | null;
  memberCount: number;
  isMember: boolean;
}

/** Neuestes Community-Cover pro Tenant (StorageObject purpose "community-cover"). */
export async function communityCoverMap(
  tenantIds: string[],
): Promise<Map<string, string>> {
  if (tenantIds.length === 0) return new Map();
  const rows = await prisma.storageObject.findMany({
    where: { tenantId: { in: tenantIds }, purpose: "community-cover" },
    orderBy: { createdAt: "desc" },
    select: { tenantId: true, url: true },
  });
  const map = new Map<string, string>();
  for (const r of rows) if (!map.has(r.tenantId)) map.set(r.tenantId, r.url);
  return map;
}

export function toCommunityCard(
  tenant: Tenant,
  opts: { coverUrl: string | null; memberCount: number; isMember: boolean },
): CommunityCardDto {
  return {
    slug: tenant.slug,
    name: tenant.name,
    tagline: tenant.tagline,
    logoUrl: tenant.logoUrl,
    coverUrl: opts.coverUrl,
    primaryColor: tenant.primaryColor,
    accentColor: tenant.accentColor,
    category: tenant.category,
    memberCount: opts.memberCount,
    isMember: opts.isMember,
  };
}

/** Discover-Kategorien (Keys aus lib/categories.ts). */
export function discoverCategories(): string[] {
  return CATEGORIES.map((c) => c.key);
}

// ================================================================ Viewer
export interface ViewerDto {
  isMember: boolean;
  role: Role | null;
  isStaff: boolean;
  status: "ACTIVE" | "PENDING" | "BANNED" | null;
  tier: { id: string; name: string; slug: string } | null;
  points: number;
  levelName: string | null;
  hasPaidEntitlement: boolean;
  unreadNotifications: number;
}

export interface ViewerContext {
  viewer: ViewerDto;
  ctx: AccessContext;
}

export async function buildViewerContext(
  tenant: Tenant,
  user: User | null,
): Promise<ViewerContext> {
  const ctx = await buildAccessContext(tenant.id, user?.id ?? null);
  if (!user) {
    return {
      ctx,
      viewer: {
        isMember: false,
        role: null,
        isStaff: false,
        status: null,
        tier: null,
        points: 0,
        levelName: null,
        hasPaidEntitlement: false,
        unreadNotifications: 0,
      },
    };
  }
  const membership = ctx.membership;
  const [tier, stats, unread] = await Promise.all([
    membership?.tierId
      ? prisma.membershipTier.findFirst({
          where: { id: membership.tierId, tenantId: tenant.id },
          select: { id: true, name: true, slug: true },
        })
      : Promise.resolve(null),
    prisma.memberStats.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      select: { points: true, levelName: true },
    }),
    unreadNotificationCount(tenant.id, user.id),
  ]);
  return {
    ctx,
    viewer: {
      isMember: membership?.status === "ACTIVE",
      role: ctx.role,
      isStaff: ctx.isStaff,
      status: membership?.status ?? null,
      tier,
      points: stats?.points ?? 0,
      levelName: stats?.levelName ?? null,
      hasPaidEntitlement: ctx.hasPaidEntitlement,
      unreadNotifications: unread,
    },
  };
}

// ================================================================ Spaces
export interface SpaceSummaryDto {
  slug: string;
  name: string;
  type: SpaceType;
  icon: string | null;
  visibility: "PUBLIC" | "MEMBERS" | "PAID";
  accessible: boolean;
  sortOrder: number;
}

export function toSpaceSummary(space: Space, ctx: AccessContext): SpaceSummaryDto {
  return {
    slug: space.slug,
    name: space.name,
    type: space.type,
    icon: space.icon,
    visibility: space.visibility,
    accessible: canAccess(space, ctx),
    sortOrder: space.sortOrder,
  };
}

/** Sichtbare Spaces (keine ADS, keine Banner-Container, nicht archiviert). */
export async function visibleSpaces(tenantId: string): Promise<Space[]> {
  const rows = await prisma.space.findMany({
    where: { tenantId, isArchived: false },
    orderBy: { sortOrder: "asc" },
  });
  return rows.filter((s) => s.type !== "ADS" && !isAnnouncementsOnly(s.settings));
}

export interface AnnouncementDto {
  id: string;
  message: string;
  bgColor: string;
  textColor: string;
  href: string | null;
}

/** Erste aktive Banner-Ansage über alle Spaces (wie das Web-Banner). */
export function activeAnnouncementFor(spaces: Space[]): AnnouncementDto | null {
  for (const space of spaces) {
    const list = activeAnnouncements(space.settings);
    const a = list[0];
    if (a) {
      return {
        id: a.id,
        message: a.message ? `${a.title} ${a.message}` : a.title,
        bgColor: a.bgColor,
        textColor: a.textColor,
        href: a.ctaUrl,
      };
    }
  }
  return null;
}

// ================================================================ Posts
export interface PostDto {
  id: string;
  spaceSlug: string;
  spaceType: SpaceType;
  title: string | null;
  body: string | null;
  bodyHtml: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  teaserUrl: string | null;
  isPinned: boolean;
  publishedAt: string;
  author: AuthorDto;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  locked: boolean;
  unlock: UnlockDto | null;
  score: number | null;
  myVote: "UP" | "DOWN" | null;
  readingMinutes: number | null;
}

export interface PostRow {
  id: string;
  title: string | null;
  body: string;
  bodyHtml: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  teaserUrl: string | null;
  isPinned: boolean;
  publishedAt: Date;
  priceCents: number;
  currency: string;
  entitlementKey: string | null;
  author: { id: string; name: string; avatarUrl: string | null };
  _count: { comments: number };
}

export function isPostLocked(
  post: { priceCents: number; entitlementKey: string | null },
  ctx: AccessContext,
): boolean {
  return (
    post.priceCents > 0 &&
    !ctx.isStaff &&
    (!post.entitlementKey || !ctx.keys.has(post.entitlementKey))
  );
}

interface PostEngagement {
  likeCounts: Map<string, number>;
  likedByMe: Set<string>;
  scores: Map<string, number>;
  myVotes: Map<string, "UP" | "DOWN">;
}

/** Likes/Votes für eine Post-Liste, gebatcht. */
export async function postEngagement(
  tenantId: string,
  postIds: string[],
  userId: string | null,
  withVotes: boolean,
): Promise<PostEngagement> {
  const empty: PostEngagement = {
    likeCounts: new Map(),
    likedByMe: new Set(),
    scores: new Map(),
    myVotes: new Map(),
  };
  if (postIds.length === 0) return empty;

  const [likeGroups, myLikes, voteGroups, myVotes] = await Promise.all([
    prisma.reaction.groupBy({
      by: ["postId"],
      where: { tenantId, postId: { in: postIds }, type: "LIKE" },
      _count: true,
    }),
    userId
      ? prisma.reaction.findMany({
          where: { tenantId, userId, postId: { in: postIds }, type: "LIKE" },
          select: { postId: true },
        })
      : Promise.resolve([]),
    withVotes
      ? prisma.reaction.groupBy({
          by: ["postId", "type"],
          where: { tenantId, postId: { in: postIds }, type: { in: ["UP", "DOWN"] } },
          _count: true,
        })
      : Promise.resolve([]),
    withVotes && userId
      ? prisma.reaction.findMany({
          where: { tenantId, userId, postId: { in: postIds }, type: { in: ["UP", "DOWN"] } },
          select: { postId: true, type: true },
        })
      : Promise.resolve([]),
  ]);

  for (const g of likeGroups) {
    if (g.postId) empty.likeCounts.set(g.postId, g._count as number);
  }
  for (const r of myLikes) if (r.postId) empty.likedByMe.add(r.postId);
  for (const g of voteGroups) {
    if (!g.postId) continue;
    empty.scores.set(
      g.postId,
      (empty.scores.get(g.postId) ?? 0) + (g.type === "UP" ? 1 : -1) * (g._count as number),
    );
  }
  for (const v of myVotes) {
    if (v.postId) empty.myVotes.set(v.postId, v.type as "UP" | "DOWN");
  }
  return empty;
}

export function toPostDto(
  post: PostRow,
  space: { slug: string; type: SpaceType },
  ctx: AccessContext,
  roles: Map<string, Role>,
  engagement: PostEngagement,
  opts: { blogListing?: boolean } = {},
): PostDto {
  const locked = isPostLocked(post, ctx);
  const isForum = space.type === "FORUM";
  // BLOG-Index: body serverseitig genullt, readingMinutes = bodyChars/1000.
  const blog = opts.blogListing === true;
  const nullBody = locked || blog;
  return {
    id: post.id,
    spaceSlug: space.slug,
    spaceType: space.type,
    title: post.title,
    body: nullBody ? null : post.body,
    bodyHtml: nullBody ? null : post.bodyHtml,
    imageUrl: locked ? null : post.imageUrl,
    videoUrl: locked ? null : post.videoUrl,
    teaserUrl: post.teaserUrl,
    isPinned: post.isPinned,
    publishedAt: post.publishedAt.toISOString(),
    author: toAuthor(post.author, roles),
    likeCount: engagement.likeCounts.get(post.id) ?? 0,
    likedByMe: engagement.likedByMe.has(post.id),
    commentCount: post._count.comments,
    locked,
    unlock: locked
      ? unlockDto("post", post.id, post.priceCents, post.currency)
      : null,
    score: isForum ? engagement.scores.get(post.id) ?? 0 : null,
    myVote: isForum ? engagement.myVotes.get(post.id) ?? null : null,
    readingMinutes: blog
      ? Math.max(1, Math.round((post.body ?? "").length / 1000))
      : null,
  };
}

export const POST_INCLUDE = {
  author: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { comments: true } },
} as const;

/** Rows → DTOs inkl. gebatchtem Engagement + Rollen. */
export async function postDtos(
  tenantId: string,
  rows: PostRow[],
  space: { slug: string; type: SpaceType },
  ctx: AccessContext,
  userId: string | null,
  opts: { blogListing?: boolean } = {},
): Promise<PostDto[]> {
  const [roles, engagement] = await Promise.all([
    roleMapFor(tenantId, rows.map((p) => p.author.id)),
    postEngagement(tenantId, rows.map((p) => p.id), userId, space.type === "FORUM"),
  ]);
  return rows.map((p) => toPostDto(p, space, ctx, roles, engagement, opts));
}

// ================================================================ Comments
export interface CommentDto {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  author: AuthorDto;
  score: number;
  myVote: "UP" | "DOWN" | null;
  children: CommentDto[];
}

/** Alle Kommentare eines Posts als verschachtelter Baum inkl. Votes. */
export async function commentTree(
  tenantId: string,
  postId: string,
  userId: string | null,
): Promise<CommentDto[]> {
  const rows = await prisma.comment.findMany({
    where: { tenantId, postId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
  const ids = rows.map((c) => c.id);
  const [roles, voteGroups, myVotes] = await Promise.all([
    roleMapFor(tenantId, rows.map((c) => c.author.id)),
    ids.length
      ? prisma.reaction.groupBy({
          by: ["commentId", "type"],
          where: { tenantId, commentId: { in: ids }, type: { in: ["UP", "DOWN"] } },
          _count: true,
        })
      : Promise.resolve([]),
    userId && ids.length
      ? prisma.reaction.findMany({
          where: { tenantId, userId, commentId: { in: ids }, type: { in: ["UP", "DOWN"] } },
          select: { commentId: true, type: true },
        })
      : Promise.resolve([]),
  ]);
  const scores = new Map<string, number>();
  for (const g of voteGroups) {
    if (!g.commentId) continue;
    scores.set(
      g.commentId,
      (scores.get(g.commentId) ?? 0) + (g.type === "UP" ? 1 : -1) * (g._count as number),
    );
  }
  const mine = new Map<string, "UP" | "DOWN">();
  for (const v of myVotes) if (v.commentId) mine.set(v.commentId, v.type as "UP" | "DOWN");

  const byId = new Map<string, CommentDto>();
  for (const c of rows) {
    byId.set(c.id, {
      id: c.id,
      postId: c.postId,
      parentId: c.parentId,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: toAuthor(c.author, roles),
      score: scores.get(c.id) ?? 0,
      myVote: mine.get(c.id) ?? null,
      children: [],
    });
  }
  const roots: CommentDto[] = [];
  for (const c of rows) {
    const dto = byId.get(c.id)!;
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    if (parent) parent.children.push(dto);
    else roots.push(dto);
  }
  return roots;
}

/** Einzelner frisch erstellter Kommentar (ohne Kinder). */
export async function singleCommentDto(
  tenantId: string,
  comment: {
    id: string;
    postId: string;
    parentId: string | null;
    body: string;
    createdAt: Date;
    author: { id: string; name: string; avatarUrl: string | null };
  },
): Promise<CommentDto> {
  const roles = await roleMapFor(tenantId, [comment.author.id]);
  return {
    id: comment.id,
    postId: comment.postId,
    parentId: comment.parentId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: toAuthor(comment.author, roles),
    score: 0,
    myVote: null,
    children: [],
  };
}

// ================================================================ Tiers
export interface TierDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  benefits: string[];
  coverUrl: string | null;
  priceCents: number;
  currency: string;
  interval: "FREE" | "MONTH" | "YEAR" | "ONE_TIME";
  isRecommended: boolean;
  isDefault: boolean;
  memberCount: number;
  appleProductId: string | null;
  isCurrent: boolean;
}

export async function tierDtos(
  tenant: Tenant,
  membership: Membership | null,
): Promise<TierDto[]> {
  const tiers = await prisma.membershipTier.findMany({
    where: { tenantId: tenant.id, isPublic: true },
    orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }],
  });
  const counts = await prisma.membership.groupBy({
    by: ["tierId"],
    where: { tenantId: tenant.id, status: "ACTIVE", tierId: { in: tiers.map((t) => t.id) } },
    _count: true,
  });
  const countMap = new Map<string, number>();
  for (const c of counts) if (c.tierId) countMap.set(c.tierId, c._count as number);
  return tiers.map((t) => toTierDto(t, countMap.get(t.id) ?? 0, membership));
}

export function toTierDto(
  tier: MembershipTier,
  memberCount: number,
  membership: Membership | null,
): TierDto {
  return {
    id: tier.id,
    name: tier.name,
    slug: tier.slug,
    description: tier.description,
    benefits: (tier.description ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    coverUrl: tier.coverUrl,
    priceCents: tier.priceCents,
    currency: tier.currency,
    interval: tier.interval,
    isRecommended: tier.isRecommended,
    isDefault: tier.isDefault,
    memberCount,
    appleProductId: tierAppleProductId(tier),
    isCurrent: membership?.status === "ACTIVE" && membership.tierId === tier.id,
  };
}

// ================================================================ Products
export interface ProductDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  images: string[];
  priceCents: number;
  currency: string;
  type: "DIGITAL" | "PHYSICAL" | "BUNDLE" | "COURSE_ACCESS" | "TIER_GRANT";
  requiresShipping: boolean;
  inStock: boolean;
  owned: boolean;
  downloadUrl: string | null;
  appleProductId: string | null;
}

export async function productDtos(
  tenantId: string,
  ctx: AccessContext,
  userId: string | null,
  spaceId?: string,
): Promise<ProductDto[]> {
  const products = await prisma.product.findMany({
    where: {
      tenantId,
      isPublished: true,
      // Dashboard-Produkte sind ein tenant-weiter Katalog (spaceId null).
      ...(spaceId ? { OR: [{ spaceId }, { spaceId: null }] } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  const ownedIds = userId
    ? new Set(
        (
          await prisma.order.findMany({
            where: { tenantId, userId, status: "PAID", productId: { not: null } },
            select: { productId: true },
          })
        ).map((o) => o.productId),
      )
    : new Set<string | null>();
  return products.map((p) => {
    const owned =
      ownedIds.has(p.id) ||
      Boolean(p.grantsEntitlementKey && ctx.keys.has(p.grantsEntitlementKey)) ||
      (p.priceCents === 0 && ctx.isStaff);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      coverUrl: p.coverUrl ?? p.images[0] ?? null,
      images: p.images,
      priceCents: p.priceCents,
      currency: p.currency,
      type: p.type,
      requiresShipping: p.requiresShipping,
      inStock: p.stock === null || p.stock > 0,
      owned,
      downloadUrl: owned ? p.downloadUrl : null,
      appleProductId: productAppleProductId(p),
    };
  });
}

// ================================================================ Courses
export interface LessonDto {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  videoUrl: string | null;
  durationSec: number | null;
  sortOrder: number;
  isPreview: boolean;
  unlocked: boolean;
  daysUntilUnlock: number | null;
  completed: boolean;
}

export interface CourseDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  format: "ONLINE" | "OFFLINE";
  videoUrl: string | null;
  streamUrl: string | null;
  location: string | null;
  address: string | null;
  startsAt: string | null;
  accessible: boolean;
  progress: { completed: number; total: number };
  lessons: LessonDto[];
}

export async function courseDtos(
  tenantId: string,
  spaceId: string,
  ctx: AccessContext,
  userId: string | null,
): Promise<CourseDto[]> {
  const courses = await prisma.course.findMany({
    where: { tenantId, spaceId, isPublished: true },
    orderBy: { createdAt: "asc" },
    include: { lessons: { orderBy: { sortOrder: "asc" } } },
  });
  const completed = userId
    ? new Set(
        (
          await prisma.lessonProgress.findMany({
            where: { tenantId, userId },
            select: { lessonId: true },
          })
        ).map((p) => p.lessonId),
      )
    : new Set<string>();
  const joinedAt = ctx.membership?.joinedAt ?? null;

  return courses.map((c) => {
    const accessible =
      ctx.isStaff ||
      !c.requiredEntitlementKey ||
      ctx.keys.has(c.requiredEntitlementKey);
    const lessons: LessonDto[] = c.lessons.map((l) => {
      // Drip-Content: erst N Tage nach Beitritt (Staff sieht alles).
      const dripOpen = ctx.isStaff || isLessonUnlocked(joinedAt, l.dripAfterDays);
      const unlocked = dripOpen && (accessible || l.isPreview);
      const waitDays =
        !dripOpen && joinedAt && l.dripAfterDays
          ? daysUntilUnlock(joinedAt, l.dripAfterDays)
          : null;
      return {
        id: l.id,
        title: l.title,
        slug: l.slug,
        // Gated-Nulling: Inhalt & Video nie an Nicht-Berechtigte leaken.
        content: unlocked ? l.content || null : null,
        videoUrl: unlocked ? l.videoUrl : null,
        durationSec: l.durationSec > 0 ? l.durationSec : null,
        sortOrder: l.sortOrder,
        isPreview: l.isPreview,
        unlocked,
        daysUntilUnlock: waitDays,
        completed: completed.has(l.id),
      };
    });
    return {
      id: c.id,
      title: c.title,
      slug: c.slug,
      description: c.description,
      coverUrl: c.coverUrl,
      format: c.format === "OFFLINE" ? "OFFLINE" : "ONLINE",
      videoUrl: accessible ? c.videoUrl : null,
      streamUrl: accessible ? c.streamUrl : null,
      location: c.location,
      address: c.address,
      startsAt: c.startsAt ? c.startsAt.toISOString() : null,
      accessible,
      progress: {
        completed: lessons.filter((l) => l.completed).length,
        total: lessons.length,
      },
      lessons,
    };
  });
}

// ================================================================ Events
export interface EventDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  isOnline: boolean;
  meetingUrl: string | null;
  capacity: number | null;
  rsvpCount: number;
  myRsvp: boolean;
  accessible: boolean;
}

export async function eventDtos(
  tenantId: string,
  ctx: AccessContext,
  userId: string | null,
  spaceId?: string | string[],
): Promise<EventDto[]> {
  const events = await prisma.event.findMany({
    where: {
      tenantId,
      ...(spaceId
        ? { spaceId: Array.isArray(spaceId) ? { in: spaceId } : spaceId }
        : {}),
    },
    orderBy: { startsAt: "asc" },
    include: { _count: { select: { rsvps: true } } },
  });
  const myRsvps = userId
    ? new Set(
        (
          await prisma.eventRsvp.findMany({
            where: { tenantId, userId, eventId: { in: events.map((e) => e.id) } },
            select: { eventId: true },
          })
        ).map((r) => r.eventId),
      )
    : new Set<string>();
  const isActiveMember = ctx.membership?.status === "ACTIVE";
  return events.map((e) => {
    const accessible =
      ctx.isStaff || !e.requiredEntitlementKey || ctx.keys.has(e.requiredEntitlementKey);
    return {
      id: e.id,
      title: e.title,
      slug: e.slug,
      description: e.description,
      coverUrl: e.coverUrl,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt ? e.endsAt.toISOString() : null,
      location: e.location,
      isOnline: e.isOnline,
      // Meeting-Link nur für Mitglieder mit Zugriff.
      meetingUrl: accessible && (isActiveMember || ctx.isStaff) ? e.meetingUrl : null,
      capacity: e.capacity,
      rsvpCount: e._count.rsvps,
      myRsvp: myRsvps.has(e.id),
      accessible,
    };
  });
}

// ================================================================ Gallery
export interface MediaItemDto {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string | null;
  thumbUrl: string | null;
  locked: boolean;
  isPreview: boolean;
  unlock: UnlockDto | null;
}

export interface GalleryPackageDto {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  priceCents: number;
  currency: string;
  owned: boolean;
  availableUntil: string | null;
  unlock: UnlockDto | null;
  items: MediaItemDto[];
}

interface MediaPackageRow {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  priceCents: number;
  currency: string;
  entitlementKey: string;
  availableUntil: Date | null;
  items: {
    id: string;
    type: string;
    url: string;
    teaserUrl: string | null;
    isPreview: boolean;
    priceCents: number;
    entitlementKey: string | null;
    sortOrder: number;
  }[];
}

export function toGalleryPackageDto(
  p: MediaPackageRow,
  ctx: AccessContext,
): GalleryPackageDto {
  // Zugriffs-Logik gespiegelt aus app/c/[slug]/s/[spaceSlug]/page.tsx (GALLERY).
  const owned = ctx.isStaff || p.priceCents === 0 || ctx.keys.has(p.entitlementKey);
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    coverUrl: p.coverUrl,
    priceCents: p.priceCents,
    currency: p.currency,
    owned,
    availableUntil: p.availableUntil ? p.availableUntil.toISOString() : null,
    unlock:
      !owned && p.priceCents > 0
        ? unlockDto("media", p.id, p.priceCents, p.currency)
        : null,
    items: p.items.map((i) => {
      const itemUnlocked =
        owned ||
        i.isPreview ||
        (i.priceCents > 0 && !!i.entitlementKey && ctx.keys.has(i.entitlementKey));
      return {
        id: i.id,
        type: i.type === "VIDEO" ? "VIDEO" : "IMAGE",
        // Gesperrte Medien-URLs nie leaken.
        url: itemUnlocked ? i.url : null,
        thumbUrl: i.teaserUrl,
        locked: !itemUnlocked,
        isPreview: i.isPreview,
        unlock:
          !itemUnlocked && i.priceCents > 0
            ? unlockDto("media-item", i.id, i.priceCents, p.currency)
            : null,
      };
    }),
  };
}

export async function galleryPackageDtos(
  tenantId: string,
  spaceId: string,
  ctx: AccessContext,
): Promise<GalleryPackageDto[]> {
  const now = new Date();
  const rows = await prisma.mediaPackage.findMany({
    where: {
      tenantId,
      spaceId,
      isPublished: true,
      OR: [{ availableUntil: null }, { availableUntil: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  return rows.map((p) => toGalleryPackageDto(p, ctx));
}

// ================================================================ Chat
export interface ConversationDto {
  id: string;
  type: "GROUP" | "DIRECT";
  title: string;
  avatarUrl: string | null;
  lastMessage: { body: string; createdAt: string; author: AuthorDto } | null;
  spaceSlug: string | null;
}

export interface ChatMessageDto {
  id: string;
  body: string;
  createdAt: string;
  author: AuthorDto;
  mine: boolean;
}

/** Unified inbox: zugängliche Gruppen-Chats (CHAT-Spaces) + eigene DMs. */
export async function conversationDtos(
  tenant: Tenant,
  ctx: AccessContext,
  user: User | null,
): Promise<ConversationDto[]> {
  const chatSpaces = await prisma.space.findMany({
    where: { tenantId: tenant.id, type: "CHAT", isArchived: false },
    orderBy: { sortOrder: "asc" },
  });
  const groups = chatSpaces.filter(
    (s) => !isAnnouncementsOnly(s.settings) && canAccess(s, ctx),
  );
  const groupIds = groups.map((g) => g.id);

  const [groupLasts, dms] = await Promise.all([
    groupIds.length
      ? prisma.chatMessage.findMany({
          where: { tenantId: tenant.id, spaceId: { in: groupIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["spaceId"],
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        })
      : Promise.resolve([]),
    user
      ? prisma.conversation.findMany({
          where: { tenantId: tenant.id, kind: "DIRECT", members: { some: { userId: user.id } } },
          include: {
            members: {
              include: { user: { select: { id: true, name: true, avatarUrl: true } } },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { user: { select: { id: true, name: true, avatarUrl: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const authorIds = [
    ...groupLasts.map((m) => m.user.id),
    ...dms.flatMap((c) => (c.messages[0] ? [c.messages[0].user.id] : [])),
  ];
  const roles = await roleMapFor(tenant.id, authorIds);

  const lastBySpace = new Map<string, (typeof groupLasts)[number]>();
  for (const m of groupLasts) if (m.spaceId) lastBySpace.set(m.spaceId, m);

  const out: ConversationDto[] = [];
  for (const g of groups) {
    const last = lastBySpace.get(g.id) ?? null;
    out.push({
      id: g.id,
      type: "GROUP",
      title: g.name,
      avatarUrl: null,
      lastMessage: last
        ? {
            body: last.body,
            createdAt: last.createdAt.toISOString(),
            author: toAuthor(last.user, roles),
          }
        : null,
      spaceSlug: g.slug,
    });
  }
  for (const c of dms) {
    const other = c.members.find((m) => m.userId !== user?.id);
    if (!other) continue;
    const last = c.messages[0] ?? null;
    out.push({
      id: c.id,
      type: "DIRECT",
      title: other.user.name,
      avatarUrl: other.user.avatarUrl,
      lastMessage: last
        ? {
            body: last.body,
            createdAt: last.createdAt.toISOString(),
            author: toAuthor(last.user, roles),
          }
        : null,
      spaceSlug: null,
    });
  }
  out.sort((a, b) => {
    const aAt = a.lastMessage?.createdAt ?? "";
    const bAt = b.lastMessage?.createdAt ?? "";
    if (aAt && bAt) return aAt < bAt ? 1 : -1;
    if (aAt) return -1;
    if (bAt) return 1;
    return a.title.localeCompare(b.title);
  });
  return out;
}

export async function chatMessageDtos(
  tenantId: string,
  rows: {
    id: string;
    body: string;
    createdAt: Date | string;
    user: { id: string; name: string; avatarUrl: string | null };
  }[],
  meId: string,
): Promise<ChatMessageDto[]> {
  const roles = await roleMapFor(tenantId, rows.map((r) => r.user.id));
  return rows.map((m) => ({
    id: m.id,
    body: m.body,
    createdAt: typeof m.createdAt === "string" ? m.createdAt : m.createdAt.toISOString(),
    author: toAuthor(m.user, roles),
    mine: m.user.id === meId,
  }));
}

// ================================================================ Notifications / Members / Orders
export interface NotificationDto {
  id: string;
  type: "POST_COMMENT" | "COMMENT_REPLY" | "REACTION";
  message: string;
  href: string | null;
  actor: AuthorDto | null;
  createdAt: string;
  readAt: string | null;
}

export interface MemberCardDto {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  tierName: string | null;
  points: number;
  levelName: string | null;
  joinedAt: string;
}

export interface OrderDto {
  id: string;
  description: string;
  amountCents: number;
  currency: string;
  status: "PENDING" | "PAID" | "REFUNDED" | "FAILED";
  createdAt: string;
  productName: string | null;
  downloadUrl: string | null;
}

export function toOrderDto(order: {
  id: string;
  description: string;
  amountCents: number;
  currency: string;
  status: "PENDING" | "PAID" | "REFUNDED" | "FAILED";
  createdAt: Date;
  product: { name: string; downloadUrl: string | null } | null;
}): OrderDto {
  return {
    id: order.id,
    description: order.description,
    amountCents: order.amountCents,
    currency: order.currency,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    productName: order.product?.name ?? null,
    downloadUrl: order.status === "PAID" ? order.product?.downloadUrl ?? null : null,
  };
}

// ================================================================ Content union
export interface RequestDto {
  id: string;
  title: string;
  body: string;
  status: "OPEN" | "ACCEPTED" | "PRICED" | "FULFILLED" | "DECLINED";
  score: number;
  myVote: "UP" | "DOWN" | null;
  priceCents: number | null;
  unlock: UnlockDto | null;
  author: AuthorDto;
  createdAt: string;
}

export interface BookingSlotDto {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  durationMin: number;
  capacity: number;
  spotsLeft: number;
  priceCents: number;
  currency: string;
  unlock: UnlockDto | null;
  myReservation: "PENDING" | "CONFIRMED" | null;
}

export type ContentDto =
  | { kind: "posts"; posts: PostDto[]; canPost: boolean; nextCursor: string | null }
  | { kind: "forum"; posts: PostDto[]; canPost: boolean; tab: "top" | "new"; nextCursor: string | null }
  | { kind: "blog"; posts: PostDto[]; page: number; totalPages: number }
  | { kind: "gallery"; packages: GalleryPackageDto[] }
  | { kind: "courses"; courses: CourseDto[] }
  | { kind: "shop"; products: ProductDto[] }
  | { kind: "events"; upcoming: EventDto[]; past: EventDto[] }
  | {
      kind: "newsletter";
      campaigns: { id: string; subject: string; preheader: string | null; bodyHtml: string; sentAt: string | null }[];
    }
  | {
      kind: "knowledge";
      articles: { id: string; title: string; slug: string; excerpt: string; bodyHtml: string | null; locked: boolean; updatedAt: string }[];
    }
  | { kind: "links"; links: { label: string; url: string; description: string | null }[] }
  | {
      kind: "live";
      sessions: {
        id: string;
        title: string;
        description: string | null;
        status: "SCHEDULED" | "LIVE" | "ENDED";
        scheduledAt: string | null;
        streamUrl: string | null;
        replayUrl: string | null;
        accessible: boolean;
      }[];
    }
  | { kind: "chat"; conversations: ConversationDto[] }
  | { kind: "requests"; requests: RequestDto[]; canCreate: boolean }
  | { kind: "booking"; slots: BookingSlotDto[] }
  | {
      kind: "stories";
      groups: {
        author: AuthorDto;
        stories: { id: string; mediaUrl: string; mediaType: "IMAGE" | "VIDEO"; createdAt: string; expiresAt: string }[];
      }[];
    }
  | {
      kind: "tips";
      goal: { title: string; targetCents: number; raisedCents: number } | null;
      presets: { amountCents: number; appleProductId: string | null }[];
      tips: { id: string; amountCents: number; message: string | null; author: AuthorDto | null; createdAt: string }[];
    }
  | {
      kind: "calendar";
      items: { kind: "event" | "live" | "post"; date: string; title: string; subtitle: string | null; spaceSlug: string | null; refId: string }[];
    };

export interface ContentArgs {
  tenant: Tenant;
  space: Space;
  ctx: AccessContext;
  user: User | null;
  q: string;
  tab: string | null;
  cursor: string | null;
  page: number;
  limit: number;
}

/** Content-Union für alle 20 Space-Typen — Datenladen gespiegelt aus der Web-Space-Page. */
export async function buildSpaceContent(args: ContentArgs): Promise<ContentDto> {
  const { tenant, space, ctx, user } = args;
  const isActiveMember = ctx.membership?.status === "ACTIVE";
  const q = args.q.trim().slice(0, 80);
  const userId = user?.id ?? null;

  const textFilter = q
    ? {
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { body: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  switch (space.type) {
    case "FEED":
    case "VIDEOS":
    case "PODCAST": {
      const now = new Date();
      const rows = await prisma.post.findMany({
        where: {
          tenantId: tenant.id,
          spaceId: space.id,
          isPublished: true,
          publishedAt: { lte: now },
          ...textFilter,
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: args.limit + 1,
        ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
        include: POST_INCLUDE,
      });
      const hasMore = rows.length > args.limit;
      const page = hasMore ? rows.slice(0, args.limit) : rows;
      const posts = await postDtos(tenant.id, page, space, ctx, userId);
      return {
        kind: "posts",
        posts,
        canPost: isActiveMember || ctx.isStaff,
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      };
    }

    case "FORUM": {
      const tab: "top" | "new" = args.tab === "new" ? "new" : "top";
      if (tab === "new") {
        const rows = await prisma.post.findMany({
          where: { tenantId: tenant.id, spaceId: space.id, isPublished: true, ...textFilter },
          orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          take: args.limit + 1,
          ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
          include: POST_INCLUDE,
        });
        const hasMore = rows.length > args.limit;
        const page = hasMore ? rows.slice(0, args.limit) : rows;
        const posts = await postDtos(tenant.id, page, space, ctx, userId);
        return {
          kind: "forum",
          posts,
          canPost: isActiveMember || ctx.isStaff,
          tab,
          nextCursor: hasMore ? page[page.length - 1]!.id : null,
        };
      }
      // "top": Score-Sortierung wie im Web (Fenster von 200, dann Cursor-Slice).
      const rows = await prisma.post.findMany({
        where: { tenantId: tenant.id, spaceId: space.id, isPublished: true, ...textFilter },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: 200,
        include: POST_INCLUDE,
      });
      const all = await postDtos(tenant.id, rows, space, ctx, userId);
      all.sort(
        (a, b) =>
          Number(b.isPinned) - Number(a.isPinned) ||
          (b.score ?? 0) - (a.score ?? 0) ||
          (a.publishedAt < b.publishedAt ? 1 : -1),
      );
      const start = args.cursor
        ? Math.max(0, all.findIndex((p) => p.id === args.cursor) + 1)
        : 0;
      const page = all.slice(start, start + args.limit);
      const hasMore = start + args.limit < all.length;
      return {
        kind: "forum",
        posts: page,
        canPost: isActiveMember || ctx.isStaff,
        tab,
        nextCursor: hasMore && page.length ? page[page.length - 1]!.id : null,
      };
    }

    case "BLOG": {
      const cfg = parseBlogSettings(space.settings);
      const sortOrder =
        cfg.sort === "OLDEST"
          ? { createdAt: "asc" as const }
          : cfg.sort === "AZ"
            ? { title: "asc" as const }
            : cfg.sort === "ZA"
              ? { title: "desc" as const }
              : { createdAt: "desc" as const };
      const where = { tenantId: tenant.id, spaceId: space.id, isPublished: true, ...textFilter };
      const total = await prisma.post.count({ where });
      const perPage = cfg.pageSize > 0 ? cfg.pageSize : Math.max(total, 1);
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      const current = Math.min(Math.max(1, args.page), totalPages);
      const rows = await prisma.post.findMany({
        where,
        orderBy: [{ isPinned: "desc" }, sortOrder],
        skip: (current - 1) * perPage,
        take: perPage,
        include: POST_INCLUDE,
      });
      const posts = await postDtos(tenant.id, rows, space, ctx, userId, {
        blogListing: true,
      });
      return { kind: "blog", posts, page: current, totalPages };
    }

    case "GALLERY":
      return {
        kind: "gallery",
        packages: await galleryPackageDtos(tenant.id, space.id, ctx),
      };

    case "COURSE":
      return {
        kind: "courses",
        courses: await courseDtos(tenant.id, space.id, ctx, userId),
      };

    case "SHOP":
      return {
        kind: "shop",
        products: await productDtos(tenant.id, ctx, userId, space.id),
      };

    case "EVENTS": {
      const events = await eventDtos(tenant.id, ctx, userId, space.id);
      const now = Date.now();
      return {
        kind: "events",
        upcoming: events.filter((e) => Date.parse(e.startsAt) >= now),
        past: events
          .filter((e) => Date.parse(e.startsAt) < now)
          .sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1)),
      };
    }

    case "NEWSLETTER": {
      const sent = await prisma.newsletterCampaign.findMany({
        where: { tenantId: tenant.id, status: "SENT" },
        orderBy: { sentAt: "desc" },
        take: 20,
      });
      return {
        kind: "newsletter",
        campaigns: sent.map((c) => ({
          id: c.id,
          subject: c.subject,
          preheader: null,
          bodyHtml: c.body,
          sentAt: c.sentAt ? c.sentAt.toISOString() : null,
        })),
      };
    }

    case "KNOWLEDGE": {
      const articles = await prisma.knowledgeArticle.findMany({
        where: { tenantId: tenant.id, spaceId: space.id, isPublished: true, ...textFilter },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return {
        kind: "knowledge",
        articles: articles.map((a) => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
          excerpt: excerpt(a.body, 220),
          bodyHtml: a.body,
          locked: false,
          updatedAt: a.updatedAt.toISOString(),
        })),
      };
    }

    case "LINKS":
      return {
        kind: "links",
        links: parseSpaceLinks(space.settings).map((l) => ({
          label: l.title,
          url: l.url,
          description: l.description || null,
        })),
      };

    case "LIVE": {
      const sessions = await prisma.liveSession.findMany({
        where: { tenantId: tenant.id, spaceId: space.id },
        orderBy: [{ status: "asc" }, { startsAt: "desc" }, { createdAt: "desc" }],
      });
      return {
        kind: "live",
        sessions: sessions.map((s) => {
          const accessible =
            ctx.isStaff ||
            !s.requiredEntitlementKey ||
            ctx.keys.has(s.requiredEntitlementKey);
          return {
            id: s.id,
            title: s.title,
            description: null,
            status: s.status,
            scheduledAt: s.startsAt ? s.startsAt.toISOString() : null,
            streamUrl: accessible ? s.streamUrl : null,
            replayUrl: accessible ? s.replayUrl : null,
            accessible,
          };
        }),
      };
    }

    case "CHAT":
      return { kind: "chat", conversations: await conversationDtos(tenant, ctx, user) };

    case "REQUESTS": {
      const requests = await prisma.memberRequest.findMany({
        where: {
          tenantId: tenant.id,
          spaceId: space.id,
          // Abgelehnte Wünsche sieht nur der eigene Autor; Staff alles.
          ...(ctx.isStaff
            ? {}
            : {
                OR: [
                  { status: { not: "DECLINED" as const } },
                  { requesterId: userId ?? "__none__" },
                ],
              }),
        },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: 100,
        include: { requester: { select: { id: true, name: true, avatarUrl: true } } },
      });
      const [roles, myVotes] = await Promise.all([
        roleMapFor(tenant.id, requests.map((r) => r.requester.id)),
        userId
          ? prisma.requestVote.findMany({
              where: { tenantId: tenant.id, userId, requestId: { in: requests.map((r) => r.id) } },
              select: { requestId: true, value: true },
            })
          : Promise.resolve([]),
      ]);
      const voteMap = new Map<string, "UP" | "DOWN">(
        myVotes.map((v) => [v.requestId, v.value === 1 ? "UP" : "DOWN"]),
      );
      return {
        kind: "requests",
        requests: requests.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          status: r.status,
          score: r.score,
          myVote: voteMap.get(r.id) ?? null,
          priceCents: r.priceCents > 0 ? r.priceCents : null,
          unlock:
            r.status === "PRICED" && r.priceCents > 0
              ? unlockDto("request", r.id, r.priceCents, r.currency)
              : null,
          author: toAuthor(r.requester, roles),
          createdAt: r.createdAt.toISOString(),
        })),
        canCreate: isActiveMember,
      };
    }

    case "BOOKING": {
      const now = new Date();
      const slots = await prisma.bookingSlot.findMany({
        where: { tenantId: tenant.id, spaceId: space.id, isPublished: true, startsAt: { gte: now } },
        orderBy: { startsAt: "asc" },
        take: 50,
        include: {
          reservations: {
            where: { status: { in: ["CONFIRMED", "PENDING"] } },
            select: { userId: true, status: true },
          },
        },
      });
      return {
        kind: "booking",
        slots: slots.map((s) => {
          const mine = userId
            ? s.reservations.find((r) => r.userId === userId) ?? null
            : null;
          return {
            id: s.id,
            title: s.title,
            description: null,
            startsAt: s.startsAt.toISOString(),
            durationMin: s.durationMin,
            capacity: s.capacity,
            spotsLeft: Math.max(0, s.capacity - s.reservations.length),
            priceCents: s.priceCents,
            currency: s.currency,
            unlock:
              s.priceCents > 0 ? unlockDto("booking", s.id, s.priceCents, s.currency) : null,
            myReservation: mine ? (mine.status as "PENDING" | "CONFIRMED") : null,
          };
        }),
      };
    }

    case "STORIES": {
      const now = new Date();
      const rows = await prisma.story.findMany({
        where: {
          tenantId: tenant.id,
          spaceId: space.id,
          publishAt: { lte: now },
          expiresAt: { gt: now },
        },
        orderBy: { publishAt: "desc" },
        take: 100,
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      });
      const roles = await roleMapFor(tenant.id, rows.map((r) => r.author.id));
      // Pro Creator gruppieren (wie lib/stories.ts): Items ältest-zuerst,
      // Creator sortiert nach jüngster Story.
      const groups = new Map<
        string,
        { author: AuthorDto; stories: { id: string; mediaUrl: string; mediaType: "IMAGE" | "VIDEO"; createdAt: string; expiresAt: string }[] }
      >();
      for (const r of rows) {
        const mediaUrl = r.videoUrl ?? r.imageUrl;
        if (!mediaUrl) continue;
        let g = groups.get(r.authorId);
        if (!g) {
          g = { author: toAuthor(r.author, roles), stories: [] };
          groups.set(r.authorId, g);
        }
        g.stories.push({
          id: r.id,
          mediaUrl,
          mediaType: r.videoUrl ? "VIDEO" : "IMAGE",
          createdAt: r.publishAt.toISOString(),
          expiresAt: r.expiresAt.toISOString(),
        });
      }
      for (const g of groups.values()) g.stories.reverse();
      return { kind: "stories", groups: [...groups.values()] };
    }

    case "TIPS": {
      const settings =
        space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
          ? (space.settings as Record<string, unknown>)
          : {};
      const goalCents = Number(settings.tipGoalCents) || 0;
      const [agg, tips] = await Promise.all([
        prisma.tip.aggregate({
          where: { tenantId: tenant.id, spaceId: space.id, status: "PAID" },
          _sum: { amountCents: true },
        }),
        prisma.tip.findMany({
          where: { tenantId: tenant.id, spaceId: space.id, status: "PAID", isPublic: true },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        }),
      ]);
      const roles = await roleMapFor(tenant.id, tips.map((t) => t.user.id));
      return {
        kind: "tips",
        goal:
          goalCents > 0
            ? {
                title: space.name,
                targetCents: goalCents,
                raisedCents: agg._sum.amountCents ?? 0,
              }
            : null,
        presets: tipPresets(),
        tips: tips.map((t) => ({
          id: t.id,
          amountCents: t.amountCents,
          message: t.message,
          author: toAuthor(t.user, roles),
          createdAt: t.createdAt.toISOString(),
        })),
      };
    }

    case "CALENDAR": {
      const now = new Date();
      const [events, lives, scheduled] = await Promise.all([
        prisma.event.findMany({
          where: { tenantId: tenant.id, startsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
          take: 50,
          select: {
            id: true,
            title: true,
            startsAt: true,
            location: true,
            space: { select: { slug: true } },
          },
        }),
        prisma.liveSession.findMany({
          where: { tenantId: tenant.id, startsAt: { gte: now }, status: { not: "ENDED" } },
          orderBy: { startsAt: "asc" },
          take: 50,
          select: { id: true, title: true, startsAt: true, space: { select: { slug: true } } },
        }),
        prisma.post.findMany({
          where: { tenantId: tenant.id, scheduledAt: { not: null, gte: now } },
          orderBy: { scheduledAt: "asc" },
          take: 50,
          select: { id: true, title: true, scheduledAt: true, space: { select: { slug: true } } },
        }),
      ]);
      const items = [
        ...events.map((e) => ({
          kind: "event" as const,
          date: e.startsAt.toISOString(),
          title: e.title,
          subtitle: e.location,
          spaceSlug: e.space?.slug ?? null,
          refId: e.id,
        })),
        ...lives
          .filter((l) => l.startsAt)
          .map((l) => ({
            kind: "live" as const,
            date: l.startsAt!.toISOString(),
            title: l.title,
            subtitle: null,
            spaceSlug: l.space?.slug ?? null,
            refId: l.id,
          })),
        ...scheduled
          .filter((p) => p.scheduledAt)
          .map((p) => ({
            kind: "post" as const,
            date: p.scheduledAt!.toISOString(),
            title: p.title || "Beitrag",
            subtitle: null,
            spaceSlug: p.space?.slug ?? null,
            refId: p.id,
          })),
      ].sort((a, b) => (a.date < b.date ? -1 : 1));
      return { kind: "calendar", items };
    }

    default:
      // ADS o. Ä. werden nie als Space geliefert; leerer Feed als Fallback.
      return { kind: "posts", posts: [], canPost: false, nextCursor: null };
  }
}
