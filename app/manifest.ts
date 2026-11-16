import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { tenantForHost } from "@/lib/seo";

const ICONS: MetadataRoute.Manifest["icons"] = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

/** #rrggbb or #rgb from the database, otherwise the fallback. */
function safeColor(value: string | null | undefined, fallback: string): string {
  return value && /^#(?:[0-9a-f]{3}){1,2}$/i.test(value) ? value : fallback;
}

/** Home-screen label: ~12 characters fit, cut on a word boundary. */
function shortName(name: string): string {
  if (name.length <= 12) return name;
  let out = "";
  for (const word of name.split(/\s+/)) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > 12) break;
    out = next;
  }
  return out || name.slice(0, 12);
}

/**
 * Web-App-Manifest je Host.
 *
 * Auf der Adresse einer Community (Subdomain oder verifizierte eigene Domain)
 * installiert man die Community, nicht die Plattform: Name, Farbe und
 * Startseite ("/" ist dort die Community-Startseite) kommen von ihr. Auf der
 * Plattform-Domain bleibt es "Aera" mit Start in /home. proxy.ts reicht
 * /manifest.webmanifest auf jedem Host unveraendert durch (host-neutral).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get("host");
  const community = await tenantForHost(host).catch(() => null);

  if (community) {
    const short = shortName(community.name);
    return {
      id: "/",
      name: community.name,
      short_name: short,
      ...(community.tagline ? { description: community.tagline } : {}),
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#f4f1ea",
      theme_color: safeColor(community.primaryColor, "#161613"),
      icons: ICONS,
    };
  }

  const t = await getTranslations("ui.auth");
  return {
    id: "/home",
    name: "Aera",
    short_name: "Aera",
    description: t("manifestDescription"),
    start_url: "/home",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: ICONS,
  };
}
