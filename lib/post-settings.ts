import "server-only";
import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { sanitizeCustomHtml } from "@/lib/rich-text";

/**
 * Per-post settings authored in the composer's "Settings" panel and stored as
 * columns on Post. Access is via raw SQL (the generated client is not
 * regenerated in every environment) and reads are defensive: before the
 * migration is applied they fall back to defaults instead of throwing.
 */

export interface PostSettings {
  customSlug: string | null;
  customHtml: string | null;
  hideComments: boolean;
  closeComments: boolean;
  hideLikes: boolean;
  hideMetaInfo: boolean;
  hideFromFeatured: boolean;
  disableTruncation: boolean;
}

export const DEFAULT_POST_SETTINGS: PostSettings = {
  customSlug: null,
  customHtml: null,
  hideComments: false,
  closeComments: false,
  hideLikes: false,
  hideMetaInfo: false,
  hideFromFeatured: false,
  disableTruncation: false,
};

/** Normalise a user-typed slug to url-safe lowercase (or null when empty). */
export function normalizeSlug(raw: string): string | null {
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || null;
}

/** Read the settings the composer submits. */
export function parsePostSettingsForm(fd: FormData): PostSettings {
  const html = String(fd.get("customHtml") || "");
  const sanitized = html.trim() ? sanitizeCustomHtml(html) : "";
  return {
    customSlug: normalizeSlug(String(fd.get("customSlug") || "")),
    customHtml: sanitized || null,
    hideComments: fd.get("hideComments") === "on",
    closeComments: fd.get("closeComments") === "on",
    hideLikes: fd.get("hideLikes") === "on",
    hideMetaInfo: fd.get("hideMetaInfo") === "on",
    hideFromFeatured: fd.get("hideFromFeatured") === "on",
    disableTruncation: fd.get("disableTruncation") === "on",
  };
}

/** Persist settings on a post. Tenant-scoped; guards a duplicate custom slug. */
export async function savePostSettings(
  tenantId: string,
  postId: string,
  settings: PostSettings,
): Promise<void> {
  try {
    // A custom slug must be unique within the tenant; drop it on collision
    // rather than failing the whole save.
    let slug = settings.customSlug;
    if (slug) {
      const clash = await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Post"
        WHERE "tenantId" = ${tenantId} AND "customSlug" = ${slug} AND "id" <> ${postId}
        LIMIT 1`;
      if (clash.length) slug = null;
    }
    await prisma.$executeRaw`
      UPDATE "Post" SET
        "customSlug" = ${slug},
        "customHtml" = ${settings.customHtml},
        "hideComments" = ${settings.hideComments},
        "closeComments" = ${settings.closeComments},
        "hideLikes" = ${settings.hideLikes},
        "hideMetaInfo" = ${settings.hideMetaInfo},
        "hideFromFeatured" = ${settings.hideFromFeatured},
        "disableTruncation" = ${settings.disableTruncation}
      WHERE "id" = ${postId} AND "tenantId" = ${tenantId}`;
  } catch {
    // Settings columns not migrated yet — leave the post as-is.
  }
}

type SettingsRow = {
  customSlug: string | null;
  customHtml: string | null;
  hideComments: boolean;
  closeComments: boolean;
  hideLikes: boolean;
  hideMetaInfo: boolean;
  hideFromFeatured: boolean;
  disableTruncation: boolean;
};

/** Read a post's settings for rendering (defaults before migration). */
export async function readPostSettings(
  tenantId: string,
  postId: string,
): Promise<PostSettings> {
  try {
    const rows = await prisma.$queryRaw<SettingsRow[]>`
      SELECT "customSlug", "customHtml", "hideComments", "closeComments",
             "hideLikes", "hideMetaInfo", "hideFromFeatured", "disableTruncation"
      FROM "Post" WHERE "id" = ${postId} AND "tenantId" = ${tenantId} LIMIT 1`;
    const r = rows[0];
    if (!r) return { ...DEFAULT_POST_SETTINGS };
    return {
      customSlug: r.customSlug ?? null,
      customHtml: r.customHtml ?? null,
      hideComments: !!r.hideComments,
      closeComments: !!r.closeComments,
      hideLikes: !!r.hideLikes,
      hideMetaInfo: !!r.hideMetaInfo,
      hideFromFeatured: !!r.hideFromFeatured,
      disableTruncation: !!r.disableTruncation,
    };
  } catch {
    return { ...DEFAULT_POST_SETTINGS };
  }
}

/** Settings for a set of posts (moderation list seeding). Defaults on failure. */
export async function getPostSettingsForPosts(
  tenantId: string,
  postIds: string[],
): Promise<Map<string, PostSettings>> {
  const map = new Map<string, PostSettings>();
  if (!postIds.length) return map;
  try {
    const rows = await prisma.$queryRaw<(SettingsRow & { id: string })[]>`
      SELECT "id", "customSlug", "customHtml", "hideComments", "closeComments",
             "hideLikes", "hideMetaInfo", "hideFromFeatured", "disableTruncation"
      FROM "Post"
      WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(postIds)})`;
    for (const r of rows) {
      map.set(r.id, {
        customSlug: r.customSlug ?? null,
        customHtml: r.customHtml ?? null,
        hideComments: !!r.hideComments,
        closeComments: !!r.closeComments,
        hideLikes: !!r.hideLikes,
        hideMetaInfo: !!r.hideMetaInfo,
        hideFromFeatured: !!r.hideFromFeatured,
        disableTruncation: !!r.disableTruncation,
      });
    }
  } catch {
    // Settings columns not migrated yet.
  }
  return map;
}

/**
 * Resolve a route param that may be a post id OR a custom slug to the real
 * post id. Falls back to treating the param as an id (also the pre-migration
 * path, since the customSlug column may not exist yet).
 */
export async function resolvePostId(
  tenantId: string,
  spaceId: string,
  idOrSlug: string,
): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Post"
      WHERE "tenantId" = ${tenantId} AND "spaceId" = ${spaceId}
        AND ("id" = ${idOrSlug} OR "customSlug" = ${idOrSlug})
      LIMIT 1`;
    return rows[0]?.id ?? null;
  } catch {
    return idOrSlug;
  }
}
