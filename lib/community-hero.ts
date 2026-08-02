import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { formatPrice } from "./utils";
import type { LayoutConfig } from "./layout";
import type { PreviewOverride } from "./preview";
import type { CommunityHeroData } from "@/components/community/community-hero";

/**
 * Baut die Daten des Kopfbereichs zusammen.
 *
 * Liegt hier, weil ihn inzwischen zwei Seiten zeichnen: die Startseite einer
 * Community und jede frei gebaute Unterseite. Die Abfragen bleiben bei den
 * Aufrufern — die Startseite braucht Mitglieder- und Beitragszahl ohnehin fuer
 * anderes —, geteilt wird nur das Zusammensetzen. Genau dort entstuende sonst
 * die Abweichung: ein neues Feld im Kopfbereich, das auf der Unterseite fehlt.
 */
export async function buildCommunityHeroData(input: {
  slug: string;
  tenant: {
    name: string;
    tagline: string | null;
    description: string | null;
    logoUrl: string | null;
    primaryColor: string;
  };
  layout: LayoutConfig;
  /** Ungespeicherter Stand aus dem Layout-Editor, nur fuer Staff. */
  preview: PreviewOverride | null;
  coverUrl: string | null;
  memberCount: number;
  postCount: number;
  cheapestPaidTier: { priceCents: number; currency: string; interval: string } | null;
  tipsHref: string | null;
  isMember: boolean;
  isStaff: boolean;
}): Promise<CommunityHeroData> {
  const t = await getTranslations("community.render.home");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale);
  const { tenant, layout, preview } = input;

  const price = input.cheapestPaidTier;
  const priceLabel = price
    ? `${formatPrice(price.priceCents, price.currency, locale)}${
        price.interval === "MONTH" ? t("perMonth") : price.interval === "YEAR" ? t("perYear") : ""
      }`
    : null;

  return {
    slug: input.slug,
    name: preview?.name ?? tenant.name,
    tagline: tenant.tagline ?? tenant.description ?? null,
    logoUrl: preview?.logoUrl !== undefined ? preview.logoUrl : tenant.logoUrl,
    // "Profilfoto verwenden" heisst genau das: kein Titelbild.
    coverUrl: layout.header.mode === "PHOTO" ? null : input.coverUrl,
    primaryColor: preview?.primaryColor ?? tenant.primaryColor,
    menu: layout.heroMenu,
    memberCount: input.memberCount,
    postCount: input.postCount,
    priceLabel,
    mosaic: layout.header.mosaic,
    socials: layout.header.socials,
    isMember: input.isMember,
    isStaff: input.isStaff,
    tipsHref: input.tipsHref,
    labels: {
      posts: t("postsCount", { count: nf.format(input.postCount) }),
      members: t("membersCount", { count: input.memberCount }),
    },
  };
}
