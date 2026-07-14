import "server-only";
import prisma from "./prisma";

export interface PublishedPostRef {
  tenantSlug: string;
  spaceSlug: string;
}

/**
 * Flip scheduled posts whose go-live time has arrived to published.
 * Runs cross-tenant (no tenant context) like the newsletter/webhook jobs.
 * Returns the affected space paths so the caller can revalidate them.
 */
export async function publishDueScheduledPosts(limit = 200): Promise<{
  published: number;
  refs: PublishedPostRef[];
}> {
  const now = new Date();
  const due = await prisma.post.findMany({
    where: { isPublished: false, scheduledAt: { not: null, lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: {
      id: true,
      space: { select: { slug: true, tenant: { select: { slug: true } } } },
    },
  });
  if (due.length === 0) return { published: 0, refs: [] };

  const ids = due.map((p) => p.id);
  await prisma.post.updateMany({
    where: { id: { in: ids } },
    data: { isPublished: true, publishedAt: now, scheduledAt: null },
  });

  const seen = new Set<string>();
  const refs: PublishedPostRef[] = [];
  for (const p of due) {
    const key = `${p.space.tenant.slug}/${p.space.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ tenantSlug: p.space.tenant.slug, spaceSlug: p.space.slug });
  }
  return { published: due.length, refs };
}
