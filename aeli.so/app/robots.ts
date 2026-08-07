import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * Pro Host verschieden — und das ist der Punkt.
 *
 * Auf dem Apex gibt es Studio, Anmeldung und Onboarding: Seiten, die in einem
 * Suchindex nichts verloren haben. Auf einer Profil-Subdomain gibt es genau
 * eine Seite, und die soll gefunden werden.
 *
 * Ein einziges, statisches robots.txt für beides müsste sich für eine der
 * beiden Seiten entscheiden — und würde entweder das Studio indexieren oder
 * jede Creator-Seite unsichtbar machen.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = ((await headers()).get("host") ?? "").split(":")[0].toLowerCase();
  const root = env.AELI_ROOT_DOMAIN;
  const isApex = host === root || host === `www.${root}` || host === "localhost";

  if (isApex) {
    return {
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/studio", "/onboarding", "/login", "/signup", "/api/"],
      },
      sitemap: `${env.AELI_APP_URL}/sitemap.xml`,
    };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `https://${host}/sitemap.xml`,
  };
}
