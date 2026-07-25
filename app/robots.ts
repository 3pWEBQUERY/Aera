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
          "/start",
        ],
      },
    ],
    sitemap: `${env.APP_URL}/sitemap.xml`,
  };
}
