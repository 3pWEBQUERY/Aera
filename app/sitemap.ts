import type { MetadataRoute } from "next";
import prisma from "@/lib/prisma";
import { env } from "@/lib/env";

/**
 * Sitemap: Marketing-Seiten + öffentliche Community-Inhalte.
 *
 * Aufgenommen werden nur PUBLIC sichtbare Spaces und deren veröffentlichte
 * Beiträge (Blog/Wissen etc.) — Mitglieder- und Paid-Inhalte bleiben draußen.
 * Kapazitäts-Limits halten die Sitemap unter den 50k-Einträgen von Google.
 */

const MAX_TENANTS = 500;
const MAX_POSTS_PER_TENANT = 200;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.APP_URL;

  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/features`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/hilfe`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/home`, changeFrequency: "daily", priority: 0.7 },
    // Rechtsseiten
    { url: `${base}/impressum`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/agb`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/datenschutz`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/widerruf`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    take: MAX_TENANTS,
    select: {
      id: true,
      slug: true,
      spaces: {
        where: { visibility: "PUBLIC", isArchived: false },
        select: { id: true, slug: true },
      },
    },
  });

  for (const t of tenants) {
    entries.push({
      url: `${base}/c/${t.slug}`,
      changeFrequency: "daily",
      priority: 0.7,
    });

    if (t.spaces.length === 0) continue;
    const publicSpaceIds = new Map(t.spaces.map((s) => [s.id, s.slug]));

    for (const s of t.spaces) {
      entries.push({
        url: `${base}/c/${t.slug}/s/${s.slug}`,
        changeFrequency: "daily",
        priority: 0.6,
      });
    }

    const posts = await prisma.post.findMany({
      where: {
        tenantId: t.id,
        isPublished: true,
        spaceId: { in: [...publicSpaceIds.keys()] },
      },
      orderBy: { publishedAt: "desc" },
      take: MAX_POSTS_PER_TENANT,
      select: { id: true, spaceId: true, updatedAt: true },
    });
    for (const p of posts) {
      entries.push({
        url: `${base}/c/${t.slug}/s/${publicSpaceIds.get(p.spaceId)}/${p.id}`,
        lastModified: p.updatedAt,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  }

  return entries;
}
