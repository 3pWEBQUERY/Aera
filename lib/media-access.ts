import "server-only";
import prisma from "./prisma";
import { canAccess, type AccessContext, type Gated } from "./entitlements";
import { isPostLocked, type GatedPost } from "./post-access";
import { isLessonUnlocked } from "./drip";
import { storageProxyUrl } from "./storage";

/**
 * Who may fetch a stored object through /api/media?
 *
 * `StorageObject.visibility` only says how the object was uploaded (by
 * purpose, see lib/upload-policy). The real gate belongs to the content that
 * references the object: a PPV post, a paid media package, a course behind a
 * paid tier. Page serializers already hide those URLs from non-buyers, but a
 * shared link used to bypass that. This module resolves the referencing
 * entities for a storage key at request time and re-applies their gate, so
 * refunds, tier downgrades and price changes take effect immediately.
 *
 * Rule: the object's own visibility still applies; on top of it, if any
 * content references the object, at least one reference must grant access.
 * Objects that nothing references fall back to their own visibility.
 */

/**
 * Purposes whose objects are made for a slot that is public by definition
 * (branding, listing covers, teasers, ads). They are never resolved against
 * content, which keeps avatars and logos fast and publicly cacheable.
 *
 * Deliberately NOT listed: post/blog/feed media, `cover` (post banner),
 * `music-cover` / `podcast-cover` (the cover of a PPV track is part of the
 * purchase), gallery/library/studio images (pickable into any post).
 */
const PUBLIC_SLOT_PURPOSES: ReadonlySet<string> = new Set([
  "avatar",
  "logo",
  "community-cover",
  "header-mosaic",
  "seo-image",
  "tier-cover",
  "event-cover",
  "course-cover",
  "product-cover",
  "ppv-teaser",
  "announcement",
  "ad-media",
  "story",
  "story-video",
]);

export function mayBeContentGated(purpose: string): boolean {
  return !PUBLIC_SLOT_PURPOSES.has(purpose);
}

type SpaceGate = Gated;
type PostGate = GatedPost & { authorId: string; space: SpaceGate };

export type MediaReference =
  /** Shown wherever the owning entity is listed (teaser, product image). */
  | { kind: "open" }
  /** Readable by anyone who may enter the space (knowledge article, package cover). */
  | { kind: "space"; space: SpaceGate }
  /** Post cover: advertising for members-only posts, part of the purchase for PPV. */
  | { kind: "post-cover"; post: PostGate }
  /** Post body, video/audio, further images. */
  | { kind: "post-content"; post: PostGate }
  | {
      kind: "media-item";
      space: SpaceGate;
      item: { isPreview: boolean; priceCents: number; entitlementKey: string | null };
      pkg: { priceCents: number; entitlementKey: string };
    }
  | { kind: "course"; space: SpaceGate; courseKey: string | null }
  | {
      kind: "lesson";
      space: SpaceGate;
      courseKey: string | null;
      isPreview: boolean;
      dripAfterDays: number | null;
    }
  | { kind: "product-download"; productId: string; grantsEntitlementKey: string | null };

const SPACE_GATE = { select: { visibility: true, requiredEntitlementKey: true } } as const;
// Upper bound per table; a single upload is rarely reused more than a handful
// of times. Hitting the cap only ever makes the decision stricter.
const MAX_REFS = 50;

/** URL spellings an array column (no substring search) may hold. */
function urlVariants(key: string, storedUrl: string): string[] {
  const proxy = storageProxyUrl(key);
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return [...new Set([storedUrl, proxy, base ? `${base}${proxy}` : proxy])];
}

/**
 * All content in the tenant that references the object. Keys are random
 * (tenants/<id>/<purpose>/<uuid>.<ext>), so a substring match on the key is
 * exact enough and covers relative, absolute and ?download= URLs alike.
 */
export async function findMediaReferences(
  tenantId: string,
  key: string,
  storedUrl: string,
): Promise<MediaReference[]> {
  const contains = { contains: key };
  const variants = urlVariants(key, storedUrl);
  const hit = (value: string | null | undefined) => !!value && value.includes(key);

  const [posts, items, packages, courses, lessons, products, articles] = await Promise.all([
    prisma.post.findMany({
      where: {
        tenantId,
        OR: [
          { imageUrl: contains },
          { coverUrl: contains },
          { teaserUrl: contains },
          { videoUrl: contains },
          { imageUrls: { hasSome: variants } },
          { bodyHtml: contains },
          { customHtml: contains },
        ],
      },
      take: MAX_REFS,
      select: {
        authorId: true,
        visibility: true,
        priceCents: true,
        entitlementKey: true,
        imageUrl: true,
        imageUrls: true,
        coverUrl: true,
        teaserUrl: true,
        videoUrl: true,
        space: SPACE_GATE,
      },
    }),
    prisma.mediaItem.findMany({
      where: { tenantId, OR: [{ url: contains }, { teaserUrl: contains }] },
      take: MAX_REFS,
      select: {
        url: true,
        teaserUrl: true,
        isPreview: true,
        priceCents: true,
        entitlementKey: true,
        package: { select: { priceCents: true, entitlementKey: true, space: SPACE_GATE } },
      },
    }),
    prisma.mediaPackage.findMany({
      where: { tenantId, coverUrl: contains },
      take: MAX_REFS,
      select: { space: SPACE_GATE },
    }),
    prisma.course.findMany({
      where: { tenantId, OR: [{ videoUrl: contains }, { coverUrl: contains }] },
      take: MAX_REFS,
      select: { videoUrl: true, requiredEntitlementKey: true, space: SPACE_GATE },
    }),
    prisma.lesson.findMany({
      where: { tenantId, OR: [{ videoUrl: contains }, { content: contains }] },
      take: MAX_REFS,
      select: {
        isPreview: true,
        dripAfterDays: true,
        course: { select: { requiredEntitlementKey: true, space: SPACE_GATE } },
      },
    }),
    prisma.product.findMany({
      where: {
        tenantId,
        OR: [{ downloadUrl: contains }, { coverUrl: contains }, { images: { hasSome: variants } }],
      },
      take: MAX_REFS,
      select: { id: true, downloadUrl: true, grantsEntitlementKey: true },
    }),
    prisma.knowledgeArticle.findMany({
      where: { tenantId, body: contains },
      take: MAX_REFS,
      select: { space: SPACE_GATE },
    }),
  ]);

  const refs: MediaReference[] = [];

  for (const p of posts) {
    const post: PostGate = {
      authorId: p.authorId,
      visibility: p.visibility,
      priceCents: p.priceCents,
      entitlementKey: p.entitlementKey,
      space: p.space,
    };
    const images = p.imageUrls ?? [];
    const inImages = images.map((u) => hit(u) || variants.includes(u));
    const cover = hit(p.imageUrl) || hit(p.coverUrl) || inImages[0] === true;
    const teaser = hit(p.teaserUrl);
    if (teaser) refs.push({ kind: "open" });
    if (cover) refs.push({ kind: "post-cover", post });
    // Everything else that matched — video/audio, further images, or the
    // rich-text body (not selected to keep the row small) — is content.
    const otherImage = inImages.slice(1).some(Boolean);
    if (hit(p.videoUrl) || otherImage || (!cover && !teaser)) {
      refs.push({ kind: "post-content", post });
    }
  }

  for (const i of items) {
    if (hit(i.teaserUrl)) refs.push({ kind: "space", space: i.package.space });
    if (hit(i.url)) {
      refs.push({
        kind: "media-item",
        space: i.package.space,
        item: { isPreview: i.isPreview, priceCents: i.priceCents, entitlementKey: i.entitlementKey },
        pkg: { priceCents: i.package.priceCents, entitlementKey: i.package.entitlementKey },
      });
    }
  }

  for (const pkg of packages) refs.push({ kind: "space", space: pkg.space });

  for (const c of courses) {
    // The cover is the course's shop window; the recorded video is the content.
    refs.push(
      hit(c.videoUrl)
        ? { kind: "course", space: c.space, courseKey: c.requiredEntitlementKey }
        : { kind: "open" },
    );
  }

  for (const l of lessons) {
    refs.push({
      kind: "lesson",
      space: l.course.space,
      courseKey: l.course.requiredEntitlementKey,
      isPreview: l.isPreview,
      dripAfterDays: l.dripAfterDays,
    });
  }

  for (const pr of products) {
    refs.push(
      hit(pr.downloadUrl)
        ? { kind: "product-download", productId: pr.id, grantsEntitlementKey: pr.grantsEntitlementKey }
        : { kind: "open" },
    );
  }

  for (const a of articles) refs.push({ kind: "space", space: a.space });

  return refs;
}

function referenceAllows(ref: MediaReference, ctx: AccessContext): boolean {
  if (ctx.isStaff) return true;
  switch (ref.kind) {
    case "open":
      return true;
    case "space":
      return canAccess(ref.space, ctx);
    case "post-cover":
      // Members-only posts advertise with their cover (also on the home page
      // of a locked space); a PPV cover belongs to what is being sold.
      if (ref.post.priceCents === 0) return true;
      return ctx.userId === ref.post.authorId || !isPostLocked(ref.post, ctx);
    case "post-content":
      if (ctx.userId !== null && ctx.userId === ref.post.authorId) return true;
      return canAccess(ref.post.space, ctx) && !isPostLocked(ref.post, ctx);
    case "media-item": {
      if (!canAccess(ref.space, ctx)) return false;
      if (ref.pkg.priceCents === 0 || ctx.keys.has(ref.pkg.entitlementKey)) return true;
      if (ref.item.isPreview) return true;
      return (
        ref.item.priceCents > 0 &&
        !!ref.item.entitlementKey &&
        ctx.keys.has(ref.item.entitlementKey)
      );
    }
    case "course":
      return canAccess(ref.space, ctx) && (!ref.courseKey || ctx.keys.has(ref.courseKey));
    case "lesson": {
      if (!canAccess(ref.space, ctx)) return false;
      if (ref.isPreview) return true;
      if (ref.courseKey && !ctx.keys.has(ref.courseKey)) return false;
      return isLessonUnlocked(ctx.membership?.joinedAt ?? null, ref.dripAfterDays);
    }
    case "product-download":
      // Ownership via PAID order is checked separately (needs a query).
      return !!ref.grantsEntitlementKey && ctx.keys.has(ref.grantsEntitlementKey);
  }
}

/**
 * True when no content gates the object, or at least one reference grants
 * the viewer access. Only queries the database for product ownership, and
 * only for a signed-in viewer.
 */
export async function mediaReferencesAllow(
  tenantId: string,
  refs: readonly MediaReference[],
  ctx: AccessContext,
): Promise<boolean> {
  if (refs.length === 0) return true;
  if (refs.some((ref) => referenceAllows(ref, ctx))) return true;
  const productIds = refs.flatMap((ref) =>
    ref.kind === "product-download" ? [ref.productId] : [],
  );
  if (productIds.length === 0 || !ctx.userId) return false;
  // A refunded or cancelled order no longer counts — only PAID.
  const order = await prisma.order.findFirst({
    where: { tenantId, userId: ctx.userId, productId: { in: productIds }, status: "PAID" },
    select: { id: true },
  });
  return order !== null;
}
