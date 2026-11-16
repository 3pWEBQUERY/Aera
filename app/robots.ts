import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { getPlatformSeo } from "@/lib/seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { noindex } = await getPlatformSeo();
  // Notbremse aus /admin/seo: sperrt die gesamte Plattform aus dem Index.
  if (noindex) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      sitemap: `${env.APP_URL}/sitemap.xml`,
    };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private/funktionale Bereiche gehören nicht in den Index.
        disallow: [
          "/api/",
          "/dashboard/",
          "/admin/",
          "/member/",
          "/login",
          "/signup",
          "/forgot",
          "/reset/",
          "/invite/",
          "/verify/",
          "/unsubscribe/",
          "/legal/accept",
          "/live-studio",
          "/start",
          // Persoenliche Community-Seiten. Pfadform auf der Plattform-Domain
          // (`*` versteht Google wie Bing) und die Kurzform auf Subdomains
          // und eigenen Domains, wo /c/<slug> wegfaellt. Die Seiten tragen
          // zusaetzlich noindex — robots.txt allein entfernt nichts aus dem
          // Index, es spart nur das Crawlen.
          "/c/*/account",
          "/c/*/notifications",
          "/c/*/library",
          "/account",
          "/notifications",
          "/library",
        ],
      },
    ],
    sitemap: `${env.APP_URL}/sitemap.xml`,
  };
}
