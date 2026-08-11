import { parseSocials } from "./socials";
import { parseTheme, resolveTheme, type AeliTheme } from "./themes";
import { toPageCards } from "./cards";
import { communityUrl, profileUrl } from "./url";
import { EMPTY_AERA_CONTENT, type AeraContent, type PageData } from "@/components/page/types";
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
  options: {
    /**
     * Ein Entwurf, der noch nicht gespeichert ist. Er gilt für die Karte in
     * `themeForCardId` — oder für die Seite, wenn keine genannt ist.
     */
    theme?: AeliTheme;
    themeForCardId?: string;
    onlyVisible?: boolean;
    isLive?: boolean;
    tipsEnabled?: boolean;
    aera?: AeraContent;
    /**
     * Welche Karte in der Vorschau im Bild steht — und die eine, die auch dann
     * mitkommt, wenn sie versteckt ist.
     */
    activeCardId?: string;
  } = {},
): PageData {
  const pageTheme = parseTheme(profile.theme);

  // Die Vorschau zeigt den STAPEL, nicht eine Karte. Sie beantwortet „was
  // sehen andere", und andere sehen mehrere Karten mit einer Leiste dazwischen
  // — eine einzelne Karte waere eine andere Seite als die echte.
  //
  // Eine Ausnahme: die Karte, an der gerade gearbeitet wird, kommt auch dann
  // mit, wenn sie versteckt ist. Sonst baute man an etwas, das die Vorschau
  // nicht zeigt. Dass sie fuer Besucher fehlt, sagt der Streifen im Studio.
  const source = options.onlyVisible
    ? profile.cards.filter((card) => card.isVisible || card.id === options.activeCardId)
    : profile.cards;

  const rows = source.map((card) => ({
    id: card.id,
    slug: card.slug,
    title: card.title,
    icon: card.icon,
    // Der Entwurf schlägt das Gespeicherte, aber nur auf der Karte, an der
    // gerade gearbeitet wird. Auf allen anderen bliebe er eine Behauptung.
    theme:
      options.theme && (!options.themeForCardId || options.themeForCardId === card.id)
        ? options.theme
        : card.theme,
    blocks: options.onlyVisible ? card.blocks.filter((block) => block.isVisible) : card.blocks,
  }));

  const cards = toPageCards(rows, pageTheme);
  const activeCardIndex = Math.max(
    0,
    cards.findIndex((card) => card.id === options.activeCardId),
  );

  return {
    profileId: profile.id,
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    bannerUrl: profile.bannerUrl,
    socials: parseSocials(profile.socials),
    theme: resolveTheme(pageTheme),
    cards,
    activeCardIndex,
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
    tipsEnabled: options.tipsEnabled ?? false,
    aera: options.aera ?? EMPTY_AERA_CONTENT,
    publicUrl: profileUrl(profile.handle),
  };
}
