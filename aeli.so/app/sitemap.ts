import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { env } from "@/lib/env";
import { appUrl } from "@/lib/url";

/**
 * Auch die Sitemap hängt am Host.
 *
 * Auf dem Apex stehen die eigenen Seiten. Auf einer Profil-Subdomain steht
 * genau ein Eintrag: diese eine Seite, mit ihrem Veröffentlichungsdatum.
 *
 * Bewusst KEINE Liste aller Profile auf dem Apex. Erstens ignorieren
 * Suchmaschinen Sitemap-Einträge fremder Hosts ohne Nachweis; zweitens wäre
 * das ein öffentliches Verzeichnis aller Aeli-Nutzer, und dafür hat niemand
 * seine Zustimmung gegeben.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = ((await headers()).get("host") ?? "").split(":")[0].toLowerCase();
  const root = env.AELI_ROOT_DOMAIN;
  const isApex = host === root || host === `www.${root}` || host === "localhost";

  if (isApex) {
    return [
      { url: appUrl("/"), changeFrequency: "weekly", priority: 1 },
      { url: appUrl("/legal/impressum"), changeFrequency: "yearly", priority: 0.2 },
      { url: appUrl("/legal/datenschutz"), changeFrequency: "yearly", priority: 0.2 },
      { url: appUrl("/legal/agb"), changeFrequency: "yearly", priority: 0.2 },
    ];
  }

  const handle = host.endsWith(`.${root}`) ? host.slice(0, -1 * (root.length + 1)) : "";
  if (!handle) return [];

  // Ohne Nutzerkontext: die RLS-Policies liefern nur veröffentlichte Profile.
  // Ein Entwurf kann hier also nicht versehentlich in eine Sitemap geraten.
  const profile = await prisma.aeliProfile.findUnique({
    where: { handle },
    select: { publishedAt: true, updatedAt: true, seoNoindex: true },
  });
  if (!profile || profile.seoNoindex) return [];

  return [
    {
      url: `https://${host}/`,
      lastModified: profile.updatedAt,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
