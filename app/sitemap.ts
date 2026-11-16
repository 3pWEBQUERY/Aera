import type { MetadataRoute } from "next";
import prisma from "@/lib/prisma";
import { PUBLIC_POST_WHERE } from "@/lib/post-access";
import { publicPostWhere } from "@/lib/blog";
import { env } from "@/lib/env";
import { tenantPublicUrl } from "@/lib/seo";
import { isAnnouncementsOnly } from "@/lib/space-settings";

/**
 * Sitemap: Marketing-Seiten + öffentliche Community-Inhalte.
 *
 * Aufgenommen werden nur PUBLIC sichtbare Spaces und deren veröffentlichte
 * Beiträge (Blog/Wissen etc.) — Mitglieder- und Paid-Inhalte bleiben draußen.
 * Kapazitäts-Limits halten die Sitemap unter den 50k-Einträgen von Google.
 */

const MAX_TENANTS = 500;
const MAX_POSTS_PER_TENANT = 200;
const MAX_BLOG_POSTS = 500;

// The sitemap depends on live tenant data. Generating it per request keeps the
// image reproducible and prevents `next build` from reading production data or
// requiring migrations that are intentionally applied during pre-deploy.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.APP_URL;

  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/features`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/hilfe`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/home`, changeFrequency: "daily", priority: 0.7 },
    // Rechtsseiten
    { url: `${base}/impressum`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/agb`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/datenschutz`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/widerruf`, changeFrequency: "yearly", priority: 0.2 },
  ];

  // Die Blogbeitraege der Plattform. Dieselbe Sichtbarkeitsbedingung wie
  // ueberall (publicPostWhere) — ein geplanter Beitrag darf hier nicht
  // auftauchen, bevor er erscheint.
  const posts = await prisma.platformPost.findMany({
    where: { ...publicPostWhere(), noindex: false },
    orderBy: { publishedAt: "desc" },
    take: MAX_BLOG_POSTS,
    select: { slug: true, updatedAt: true },
  });
  for (const post of posts) {
    entries.push({
      url: `${base}/blog/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  const tenants = await prisma.tenant.findMany({
    // seoNoindex ist die Entscheidung des Creators: wer nicht indexiert werden
    // will, gehoert auch nicht in die Sitemap — sonst widersprechen sich die
    // beiden Signale und Google meldet "eingereicht, aber noindex".
    where: { status: "ACTIVE", seoNoindex: false },
    orderBy: { createdAt: "asc" },
    take: MAX_TENANTS,
    select: {
      id: true,
      slug: true,
      // Fuer die oeffentliche Adresse (eigene Domain → Subdomain → /c/slug):
      // die Sitemap nennt dieselbe URL wie das canonical der Seite.
      subdomain: true,
      customDomain: true,
      customDomainVerifiedAt: true,
      spaces: {
        // Nur was jeder Gast oeffnen kann: oeffentlich, ohne eigenen
        // Zugangsschluessel, keine Werbe-Spaces (die haben keine Seite).
        where: {
          visibility: "PUBLIC",
          requiredEntitlementKey: null,
          isArchived: false,
          type: { not: "ADS" },
        },
        select: { id: true, slug: true, settings: true },
      },
    },
  });

  for (const t of tenants) {
    const home = tenantPublicUrl(t);
    // Reine Ankuendigungs-Spaces haben ebenfalls keine eigene Seite (404).
    const spaces = t.spaces.filter((s) => !isAnnouncementsOnly(s.settings));
    entries.push({
      url: home,
      changeFrequency: "daily",
      priority: 0.7,
    });

    if (spaces.length === 0) continue;
    const publicSpaceIds = new Map(spaces.map((s) => [s.id, s.slug]));

    for (const s of spaces) {
      entries.push({
        url: `${home}/s/${s.slug}`,
        changeFrequency: "daily",
        priority: 0.6,
      });
    }

    const posts = await prisma.post.findMany({
      where: {
        tenantId: t.id,
        isPublished: true,
        // Geplante Beitraege erst ab ihrem Termin.
        publishedAt: { lte: new Date() },
        spaceId: { in: [...publicSpaceIds.keys()] },
        // Ein Beitrag nur fuer Mitglieder gehoert nicht in die Sitemap — er
        // waere fuer jeden Besucher, der dem Link folgt, verschlossen.
        ...PUBLIC_POST_WHERE,
      },
      orderBy: { publishedAt: "desc" },
      take: MAX_POSTS_PER_TENANT,
      select: { id: true, customSlug: true, spaceId: true, updatedAt: true },
    });
    for (const p of posts) {
      entries.push({
        url: `${home}/s/${publicSpaceIds.get(p.spaceId)}/${p.customSlug || p.id}`,
        lastModified: p.updatedAt,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  }

  return entries;
}
