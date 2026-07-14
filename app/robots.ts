import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
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
