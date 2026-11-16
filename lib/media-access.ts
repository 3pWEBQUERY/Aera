import "server-only";
import prisma from "./prisma";
import type { Visibility } from "@/app/generated/prisma/client";
import { canAccess, type AccessContext } from "./entitlements";
import { isPostLocked, postLockKind, type GatedPost } from "./post-access";
import { isLessonUnlocked } from "./drip";
import { UPLOAD_PURPOSES } from "./upload-policy";

/**
 * Who may fetch an uploaded file through /api/media?
 *
 * The answer follows the gate of the content that uses the file, not the
 * upload purpose. The purpose only says where the file was uploaded from. A
 * blog image can sit in a free article or in one sold for 9.99 €, and a
 * course video can belong to a free course or a paid one. So for these
 * purposes the media proxy finds the posts, courses, lessons, gallery items
 * and pages that use the file, and asks each one's own gate, live, on every
 * request:
 *
 * - A refund deletes the entitlement, so the next request fails. No copy of
 *   the gate on the StorageObject has to be kept in sync.
 * - Changing a post from free to paid (or the reverse) takes effect at once.
 * - A file used in several places is reachable as soon as one of them grants
 *   access, which matches what the pages already show.
 *
 * If no content uses the file (a draft, or a post that was deleted), the
 * stored visibility applies, raised to at least the purpose's current
 * default. Rows uploaded before blog and feed media defaulted to MEMBERS
 * stay closed that way too.
 */
export const CONTENT_GATED_PURPOSES: ReadonlySet<string> = new Set([
  "blog-image",
  "blog-video",
  "blog-file",
  "feed-image",
  "feed-video",
  "space-video",
  "course-video",
  "podcast-audio",
  "music-audio",
  "gallery",
]);

/** Purposes uploaded from the rich text editor, so they sit inside HTML or page blocks. */
const EMBEDDED_PURPOSES: ReadonlySet<string> = new Set(["blog-image", "blog-video", "blog-file"]);

export function isContentGatedPurpose(purpose: string): boolean {
  return CONTENT_GATED_PURPOSES.has(purpose);
}

export const ANONYMOUS_ACCESS: AccessContext = Object.freeze({
  userId: null,
  membership: null,
  role: null,
  keys: new Set<string>(),
  isStaff: false,
  hasPaidEntitlement: false,
});

type StoredVisibility = Visibility;
const RANK: Record<StoredVisibility, number> = { PUBLIC: 0, MEMBERS: 1, PAID: 2 };

/** The stricter of two visibilities (PUBLIC < MEMBERS < PAID). */
export function stricterVisibility(a: StoredVisibility, b: StoredVisibility): StoredVisibility {
  return RANK[a] >= RANK[b] ? a : b;
}

interface SpaceGate {
  visibility: Visibility;
  requiredEntitlementKey: string | null;
}

export type MediaReference =
  | {
      kind: "post";
      /** "cover" stays visible as the advert of a members-only post. */
      field: "content" | "cover";
      space: SpaceGate;
      post: GatedPost & { authorId: string; isPublished: boolean; publishedAt: Date };
    }
  | {
      kind: "course";
      space: SpaceGate;
      course: { isPublished: boolean; requiredEntitlementKey: string | null };
    }
  | {
      kind: "lesson";
      space: SpaceGate;
      course: { isPublished: boolean; requiredEntitlementKey: string | null };
      lesson: { isPreview: boolean; dripAfterDays: number | null };
    }
  | {
      kind: "media-item";
      /** "teaser" is the preview shown on a locked item to everyone in the space. */
      field: "content" | "teaser";
      space: SpaceGate;
      mediaPackage: {
        isPublished: boolean;
        availableUntil: Date | null;
        priceCents: number;
        entitlementKey: string;
      };
      item: { isPreview: boolean; priceCents: number; entitlementKey: string | null };
    }
  | {
      kind: "page";
      page: { status: string; visibility: Visibility; requiredEntitlementKey: string | null };
    };

function courseOpen(
  space: SpaceGate,
  course: { isPublished: boolean; requiredEntitlementKey: string | null },
  ctx: AccessContext,
): boolean {
  if (!canAccess(space, ctx)) return false;
  if (!course.isPublished && !ctx.isStaff) return false;
  return ctx.isStaff || !course.requiredEntitlementKey || ctx.keys.has(course.requiredEntitlementKey);
}

/**
 * Would the page that renders this reference hand the file's URL to `ctx`?
 * Mirrors the rules of the space page and the mobile serializers.
 */
export function canViewMediaReference(
  ref: MediaReference,
  ctx: AccessContext,
  now: Date = new Date(),
): boolean {
  switch (ref.kind) {
    case "post": {
      if (!canAccess(ref.space, ctx)) return false;
      if (ctx.isStaff) return true;
      // Authors see their own posts, drafts and scheduled ones included.
      if (ctx.userId && ctx.userId === ref.post.authorId) return true;
      if (!ref.post.isPublished || ref.post.publishedAt > now) return false;
      if (ref.field === "cover") return postLockKind(ref.post, ctx) !== "paid";
      return !isPostLocked(ref.post, ctx);
    }
    case "course":
      return courseOpen(ref.space, ref.course, ctx);
    case "lesson": {
      if (!canAccess(ref.space, ctx)) return false;
      if (!ref.course.isPublished && !ctx.isStaff) return false;
      const dripOpen =
        ctx.isStaff || isLessonUnlocked(ctx.membership?.joinedAt ?? null, ref.lesson.dripAfterDays, now);
      return dripOpen && (courseOpen(ref.space, ref.course, ctx) || ref.lesson.isPreview);
    }
    case "media-item": {
      if (!canAccess(ref.space, ctx)) return false;
      const pkg = ref.mediaPackage;
      const listed = pkg.isPublished && (!pkg.availableUntil || pkg.availableUntil > now);
      if (!listed && !ctx.isStaff) return false;
      if (ref.field === "teaser") return true;
      const packageAccess = ctx.isStaff || pkg.priceCents === 0 || ctx.keys.has(pkg.entitlementKey);
      return (
        packageAccess ||
        ref.item.isPreview ||
        (ref.item.priceCents > 0 && !!ref.item.entitlementKey && ctx.keys.has(ref.item.entitlementKey))
      );
    }
    case "page": {
      if (ref.page.status !== "PUBLISHED" && !ctx.isStaff) return false;
      return canAccess(
        { visibility: ref.page.visibility, requiredEntitlementKey: ref.page.requiredEntitlementKey },
        ctx,
      );
    }
  }
}

const SPACE_GATE_SELECT = { visibility: true, requiredEntitlementKey: true } as const;
const COURSE_GATE_SELECT = {
  isPublished: true,
  requiredEntitlementKey: true,
  space: { select: SPACE_GATE_SELECT },
} as const;

/** Upper bound per entity type; a single file is never used this often. */
const REFERENCE_LIMIT = 50;

/**
 * Every post, course, lesson, gallery item and community page in the tenant
 * that uses one of `urls`. Must run with the tenant's RLS context active.
 */
export async function findMediaReferences(input: {
  tenantId: string;
  purpose: string;
  urls: readonly string[];
}): Promise<MediaReference[]> {
  const urls = [...new Set(input.urls.filter(Boolean))];
  if (urls.length === 0) return [];
  const { tenantId } = input;
  const embedded = EMBEDDED_PURPOSES.has(input.purpose);

  const [posts, courses, lessons, items, pages] = await Promise.all([
    prisma.post.findMany({
      where: {
        tenantId,
        OR: [
          { imageUrl: { in: urls } },
          { videoUrl: { in: urls } },
          { coverUrl: { in: urls } },
          { imageUrls: { hasSome: urls } },
          ...(embedded
            ? urls.flatMap((url) => [{ bodyHtml: { contains: url } }, { customHtml: { contains: url } }])
            : []),
        ],
      },
      select: {
        visibility: true,
        priceCents: true,
        entitlementKey: true,
        authorId: true,
        isPublished: true,
        publishedAt: true,
        imageUrl: true,
        imageUrls: true,
        videoUrl: true,
        coverUrl: true,
        space: { select: SPACE_GATE_SELECT },
      },
      take: REFERENCE_LIMIT,
    }),
    prisma.course.findMany({
      where: { tenantId, videoUrl: { in: urls } },
      select: COURSE_GATE_SELECT,
      take: REFERENCE_LIMIT,
    }),
    prisma.lesson.findMany({
      where: { tenantId, videoUrl: { in: urls } },
      select: { isPreview: true, dripAfterDays: true, course: { select: COURSE_GATE_SELECT } },
      take: REFERENCE_LIMIT,
    }),
    prisma.mediaItem.findMany({
      where: { tenantId, OR: [{ url: { in: urls } }, { teaserUrl: { in: urls } }] },
      select: {
        url: true,
        teaserUrl: true,
        isPreview: true,
        priceCents: true,
        entitlementKey: true,
        package: {
          select: {
            isPublished: true,
            availableUntil: true,
            priceCents: true,
            entitlementKey: true,
            space: { select: SPACE_GATE_SELECT },
          },
        },
      },
      take: REFERENCE_LIMIT,
    }),
    // Page blocks are JSON. A community has a handful of pages, so they are
    // searched here rather than with a text cast in SQL.
    embedded
      ? prisma.communityPage.findMany({
          where: { tenantId },
          select: { status: true, visibility: true, requiredEntitlementKey: true, blocks: true },
        })
      : Promise.resolve([]),
  ]);

  const used = (value: string | null | undefined) => !!value && urls.includes(value);
  const refs: MediaReference[] = [];

  for (const { space, imageUrl, imageUrls, videoUrl, coverUrl, ...post } of posts) {
    const inContent = used(imageUrl) || used(videoUrl) || imageUrls.some(used);
    // Matched on neither a media field nor the cover: it sits in the HTML body.
    if (inContent || !used(coverUrl)) refs.push({ kind: "post", field: "content", space, post });
    if (used(coverUrl)) refs.push({ kind: "post", field: "cover", space, post });
  }
  for (const { space, ...course } of courses) {
    refs.push({ kind: "course", space, course });
  }
  for (const { course: { space, ...course }, ...lesson } of lessons) {
    refs.push({ kind: "lesson", space, course, lesson });
  }
  for (const { package: { space, ...mediaPackage }, url, teaserUrl, ...item } of items) {
    if (used(url)) refs.push({ kind: "media-item", field: "content", space, mediaPackage, item });
    if (used(teaserUrl)) refs.push({ kind: "media-item", field: "teaser", space, mediaPackage, item });
  }
  for (const { blocks, ...page } of pages) {
    const text = JSON.stringify(blocks ?? null);
    if (urls.some((url) => text.includes(url))) refs.push({ kind: "page", page });
  }
  return refs;
}

export interface MediaObjectGate {
  purpose: string;
  visibility: StoredVisibility;
  requiredEntitlementKey: string | null;
}

/**
 * The gate that applies when no content uses the file: the stored one,
 * raised to at least the purpose's current default.
 */
export function fallbackGate(object: MediaObjectGate): {
  visibility: Visibility;
  requiredEntitlementKey: string | null;
} {
  const floor = UPLOAD_PURPOSES[object.purpose]?.visibility;
  return {
    visibility: floor ? stricterVisibility(object.visibility, floor) : object.visibility,
    requiredEntitlementKey: object.requiredEntitlementKey,
  };
}

/** May `ctx` fetch the file? `refs` is null when the purpose is not content-gated. */
export function canViewMedia(
  object: MediaObjectGate,
  refs: readonly MediaReference[] | null,
  ctx: AccessContext,
  now: Date = new Date(),
): boolean {
  if (refs && refs.length > 0) return refs.some((ref) => canViewMediaReference(ref, ctx, now));
  return canAccess(refs ? fallbackGate(object) : object, ctx);
}
