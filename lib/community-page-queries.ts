import "server-only";
import prisma from "./prisma";
import { canAccess } from "./entitlements";
import type { AccessContext } from "./entitlements";
import { parsePageBlocks, type PageBlock, type PageNavEntry } from "./community-pages";

/**
 * Zugriff auf die frei gebauten Seiten einer Community.
 *
 * Eigene Datei, weil `lib/community-pages.ts` auch im Browser laeuft — der
 * Editor baut damit seine Bausteine. Prisma gehoerte dort nicht hinein.
 */

/** Was ein Entwurf ist, sieht nur, wer ihn schreiben darf. */
function readable(
  page: { status: string; visibility: string; requiredEntitlementKey: string | null },
  ctx: AccessContext,
): boolean {
  if (page.status !== "PUBLISHED" && !ctx.isStaff) return false;
  return canAccess(
    {
      visibility: page.visibility as "PUBLIC" | "MEMBERS" | "PAID",
      requiredEntitlementKey: page.requiredEntitlementKey,
    },
    ctx,
  );
}

/**
 * Die Reiter unter dem Kopfbereich.
 *
 * Gesperrte Seiten fallen raus statt gesperrt dazustehen: ein Reiter, der zu
 * einer Wand fuehrt, ist keine Navigation, sondern eine Enttaeuschung. Staff
 * sieht zusaetzlich die eigenen Entwuerfe — sonst gaebe es keinen Weg, eine
 * unveroeffentlichte Seite im echten Rahmen anzusehen.
 */
export async function listPageNav(tenantId: string, ctx: AccessContext): Promise<PageNavEntry[]> {
  const pages = await prisma.communityPage.findMany({
    where: { tenantId, showInNav: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      slug: true,
      title: true,
      status: true,
      visibility: true,
      requiredEntitlementKey: true,
    },
  });
  return pages.filter((p) => readable(p, ctx)).map((p) => ({ slug: p.slug, title: p.title }));
}

export interface CommunityPageView {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isDraft: boolean;
  blocks: PageBlock[];
}

/** Eine Seite zum Anzeigen — `null`, wenn es sie nicht gibt oder sie gesperrt ist. */
export async function getCommunityPage(
  tenantId: string,
  pageSlug: string,
  ctx: AccessContext,
): Promise<CommunityPageView | null> {
  const page = await prisma.communityPage.findFirst({
    where: { tenantId, slug: pageSlug },
  });
  if (!page || !readable(page, ctx)) return null;
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    description: page.description,
    isDraft: page.status !== "PUBLISHED",
    blocks: parsePageBlocks(page.blocks),
  };
}
