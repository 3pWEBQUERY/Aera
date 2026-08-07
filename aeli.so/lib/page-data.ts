import { parseBlockConfig } from "./blocks";
import { parseSocials } from "./socials";
import { parseTheme, resolveTheme, type AeliTheme } from "./themes";
import { communityUrl, profileUrl } from "./url";
import type { PageData } from "@/components/page/types";
import type { ProfileWithBlocks } from "./profile";

/**
 * Vom Datenbankmodell zur Form, die die Seite rendert.
 *
 * Der Weg für die Vorschau im Studio: dort liegen ALLE Blöcke vor (auch
 * versteckte und geplante), und das Theme kann ein noch nicht gespeicherter
 * Entwurf sein. Deshalb sind beides Parameter statt fester Herleitungen.
 *
 * Die echte Seite geht ihren eigenen Weg über `getPublicProfile` — sie darf
 * gar nicht erst in die Nähe unveröffentlichter Daten kommen.
 */
export function studioPageData(
  profile: ProfileWithBlocks,
  options: { theme?: AeliTheme; onlyVisible?: boolean; isLive?: boolean } = {},
): PageData {
  const blocks = options.onlyVisible
    ? profile.blocks.filter((block) => block.isVisible)
    : profile.blocks;

  return {
    profileId: profile.id,
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    bannerUrl: profile.bannerUrl,
    socials: parseSocials(profile.socials),
    theme: resolveTheme(options.theme ?? parseTheme(profile.theme)),
    blocks: blocks.map((block) => ({
      id: block.id,
      type: block.type,
      title: block.title,
      subtitle: block.subtitle,
      href: block.href,
      mediaUrl: block.mediaUrl,
      icon: block.icon,
      config: parseBlockConfig(block.config),
    })),
    showBranding: profile.showBranding,
    gate: profile.gate,
    community: profile.linkedTenant
      ? {
          name: profile.linkedTenant.name,
          url: communityUrl(profile.linkedTenant),
          logoUrl: profile.linkedTenant.logoUrl,
          tagline: profile.linkedTenant.tagline,
        }
      : null,
    // In der Vorschau ist „live“ eine Behauptung des Studios, keine Messung:
    // der LIVE_NOW-Block soll sich zeigen, damit man ihn gestalten kann.
    isLive: options.isLive ?? Boolean(profile.linkedTenant),
    publicUrl: profileUrl(profile.handle),
  };
}
