import "server-only";
import { cache } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import prisma, { systemPrisma } from "./prisma";
import { env } from "./env";

/**
 * SEO for the platform and for every community.
 *
 * Two rules shape this file:
 *
 * 1. An empty override means "derive it", never "ship an empty tag". A creator
 *    who never opens the SEO page must still get correct, community-specific
 *    metadata built from what they entered during onboarding.
 * 2. Metadata is only worth having if it is *addressable*. Every public page
 *    names its OWN canonical URL (never the root layout: a canonical there is
 *    inherited by every page that forgets to set one and declares it a
 *    duplicate of the start page). A community canonicalises to its public
 *    address (custom domain → subdomain → /c/slug), not to app.aera.so.
 *
 * Language: the platform has no locale in its URLs — the language comes from
 * a cookie or Accept-Language (i18n/request.ts). Built-in texts are therefore
 * translated per request, and there is deliberately no hreflang: hreflang
 * pairs DIFFERENT URLs per language, and here every language shares one URL.
 */

const MAX_TITLE = 70;
const MAX_DESCRIPTION = 200;

/** Separator between a page and its community ("Forum – Fix Chor am See"). */
const COMMUNITY_TITLE_SEPARATOR = " – ";

/**
 * The shipped share image. Exactly 1200×630 (the size OG/Twitter crop to) and
 * well under 300 KB; the declared dimensions below are only emitted for this
 * file, because an admin-provided URL has unknown dimensions.
 */
export const PLATFORM_SHARE_IMAGE = {
  url: "/social/aera-og-1200x630.jpg",
  width: 1200,
  height: 630,
} as const;

/**
 * Built-in platform defaults, shown as placeholders in /admin/seo. The texts
 * that reach a visitor come from `marketing.seo.*` in their language (see
 * getPlatformSeo) — these German strings are only the reference copy.
 */
export const PLATFORM_SEO_DEFAULTS = {
  siteName: "Aera",
  title: "Aera — Deine Community. Deine Regeln. Deine Einnahmen.",
  titleTemplate: "%s — Aera",
  description:
    "Baue deine eigene Community mit Feed, Kursen, Events, Newsletter und Shop — auf deiner Domain, mit deinem Branding. Kostenlos starten, jederzeit wachsen.",
  keywords:
    "Community-Plattform, Creator, Mitgliedschaften, Online-Kurse, Newsletter, Events, Digitale Produkte",
  imageUrl: PLATFORM_SHARE_IMAGE.url,
  twitterHandle: "",
  noindex: false,
};

export interface PlatformSeoValues {
  siteName: string;
  title: string;
  titleTemplate: string;
  description: string;
  keywords: string;
  imageUrl: string;
  twitterHandle: string;
  noindex: boolean;
}

function clamp(value: string | null | undefined, max: number): string {
  const plain = (value ?? "").replace(/\s+/g, " ").trim();
  if (plain.length <= max) return plain;
  // Cut on a word boundary so the snippet does not end mid-word.
  return `${plain.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

function keywordList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** Absolute URL for an image that may be stored as a site-relative path. */
function absoluteImage(url: string | null | undefined, base: string): string | null {
  const value = (url ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${base.replace(/\/+$/, "")}/${value.replace(/^\/+/, "")}`;
}

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

/**
 * Read the singleton platform row. Runs on the privileged client: the row has
 * no tenantId and is read from the root layout, where no tenant context exists.
 * Request-deduped so the layout and its pages share one query.
 */
export const getPlatformSeo = cache(async function getPlatformSeo(): Promise<PlatformSeoValues> {
  const [row, t] = await Promise.all([
    systemPrisma.platformSeo.findUnique({ where: { id: "platform" } }).catch(() => null),
    getTranslations("marketing.seo"),
  ]);
  const d = PLATFORM_SEO_DEFAULTS;
  // An admin override is a deliberate choice and wins in every language; the
  // built-in texts follow the visitor's language, so title, description and
  // og:title can no longer disagree on the same page.
  return {
    siteName: row?.siteName?.trim() || d.siteName,
    title: row?.title?.trim() || t("title"),
    titleTemplate: row?.titleTemplate?.trim() || d.titleTemplate,
    description: row?.description?.trim() || t("description"),
    keywords: row?.keywords?.trim() || t("keywords"),
    imageUrl: row?.imageUrl?.trim() || d.imageUrl,
    twitterHandle: row?.twitterHandle?.trim() || d.twitterHandle,
    noindex: row?.noindex ?? d.noindex,
  };
});

/** og:image / twitter:image entries for the platform image. */
function platformImages(imageUrl: string, base: string) {
  const url = absoluteImage(imageUrl, base);
  if (!url) return null;
  const isShipped = imageUrl === PLATFORM_SHARE_IMAGE.url;
  return {
    og: [
      isShipped
        ? { url, width: PLATFORM_SHARE_IMAGE.width, height: PLATFORM_SHARE_IMAGE.height, alt: "Aera" }
        : { url },
    ],
    twitter: [url],
  };
}

/**
 * Root-layout metadata: defaults every page inherits.
 *
 * Deliberately WITHOUT `alternates.canonical` and `openGraph.url`: the root
 * layout wraps every route, and a canonical here declared /pricing, /hilfe,
 * /login … duplicates of the start page. Each public page sets its own via
 * buildPlatformPageMetadata / buildTenantMetadata.
 */
export async function buildPlatformMetadata(): Promise<Metadata> {
  const seo = await getPlatformSeo();
  const base = env.APP_URL.replace(/\/+$/, "");
  const images = platformImages(seo.imageUrl, base);
  const handle = seo.twitterHandle.trim().replace(/^@?/, "@");
  const description = clamp(seo.description, MAX_DESCRIPTION);

  return {
    // metadataBase turns every relative image/canonical below into an absolute
    // URL. Without it Next emits relative OG tags, which crawlers ignore.
    metadataBase: new URL(base),
    title: { default: seo.title, template: seo.titleTemplate },
    description,
    keywords: keywordList(seo.keywords),
    applicationName: seo.siteName,
    robots: seo.noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: seo.siteName,
      title: seo.title,
      description,
      ...(images ? { images: images.og } : {}),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: seo.title,
      description,
      ...(handle.length > 1 ? { site: handle, creator: handle } : {}),
      ...(images ? { images: images.twitter } : {}),
    },
  };
}

/** Options for one public platform page (marketing, help, blog, discover). */
export interface PlatformPageSeo {
  /** Page title; the platform template ("%s — Aera") is applied. Omit on "/". */
  title?: string;
  description?: string;
  /** Path of the canonical URL, e.g. "/pricing". Query strings never belong here. */
  path: string;
  type?: "website" | "article";
  /** Absolute or site-relative image; defaults to the platform share image. */
  image?: string | null;
  noindex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
}

/**
 * Complete metadata for a public platform page.
 *
 * Next merges metadata SHALLOWLY: a page that sets `openGraph: { title }`
 * loses the inherited image, site name and description. This helper therefore
 * always returns the full set — title, description, canonical, OG and
 * Twitter — so the tags of one page cannot contradict each other.
 */
export async function buildPlatformPageMetadata(page: PlatformPageSeo): Promise<Metadata> {
  const seo = await getPlatformSeo();
  const base = env.APP_URL.replace(/\/+$/, "");
  const url = `${base}${page.path === "/" ? "" : page.path}`;
  const description = clamp(page.description || seo.description, MAX_DESCRIPTION);
  const fullTitle = page.title ? seo.titleTemplate.replace("%s", page.title) : seo.title;
  const pageImage = page.image ? absoluteImage(page.image, base) : null;
  const images = pageImage
    ? { og: [{ url: pageImage }], twitter: [pageImage] }
    : platformImages(seo.imageUrl, base);
  const handle = seo.twitterHandle.trim().replace(/^@?/, "@");

  return {
    title: page.title ?? { absolute: seo.title },
    description,
    alternates: { canonical: url },
    ...(page.noindex || seo.noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: page.type ?? "website",
      siteName: seo.siteName,
      title: fullTitle,
      description,
      url,
      ...(page.publishedTime ? { publishedTime: page.publishedTime } : {}),
      ...(page.modifiedTime ? { modifiedTime: page.modifiedTime } : {}),
      ...(images ? { images: images.og } : {}),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: fullTitle,
      description,
      ...(handle.length > 1 ? { site: handle, creator: handle } : {}),
      ...(images ? { images: images.twitter } : {}),
    },
  };
}

/** Private pages (dashboard, account, token links): never in an index. */
export const NOINDEX: Metadata["robots"] = { index: false, follow: false };

// ---------------------------------------------------------------------------
// Community
// ---------------------------------------------------------------------------

/** The fields lib/seo.ts needs from a tenant — keeps callers' selects honest. */
export interface SeoTenant {
  name: string;
  slug: string;
  subdomain: string | null;
  customDomain: string | null;
  customDomainVerifiedAt: Date | null;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  category: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  seoImageUrl: string | null;
  seoNoindex: boolean;
}

export const TENANT_SEO_SELECT = {
  name: true,
  slug: true,
  subdomain: true,
  customDomain: true,
  customDomainVerifiedAt: true,
  tagline: true,
  description: true,
  logoUrl: true,
  category: true,
  seoTitle: true,
  seoDescription: true,
  seoKeywords: true,
  seoImageUrl: true,
  seoNoindex: true,
} as const;

/**
 * Where this community actually lives.
 *
 * A verified custom domain wins, then the subdomain, then the path form. Only
 * a *verified* domain counts: an unverified one does not resolve yet, and
 * canonicalising to a dead host would deindex the community.
 */
export function tenantPublicUrl(
  tenant: Pick<SeoTenant, "slug" | "subdomain" | "customDomain" | "customDomainVerifiedAt">,
): string {
  if (tenant.customDomain && tenant.customDomainVerifiedAt) {
    return `https://${tenant.customDomain}`;
  }
  const root = env.ROOT_DOMAIN;
  const label = tenant.subdomain || tenant.slug;
  if (root && root !== "localhost" && root.includes(".")) {
    return `https://${label}.${root}`;
  }
  return `${env.APP_URL.replace(/\/+$/, "")}/c/${tenant.slug}`;
}

/** The generated share card of a community (app/c/[slug]/opengraph-image.tsx). */
export function tenantShareImageUrl(tenant: Pick<SeoTenant, "slug">): string {
  return `${env.APP_URL.replace(/\/+$/, "")}/c/${tenant.slug}/opengraph-image`;
}

/**
 * The effective values — override first, otherwise derived from what the
 * creator entered during onboarding. This is what both the rendered page and
 * the dashboard preview read, so the preview cannot drift from reality.
 */
export function resolveTenantSeo(tenant: SeoTenant): {
  title: string;
  description: string;
  keywords: string[];
  imageUrl: string;
  url: string;
  noindex: boolean;
  /** True when the value is the creator's own, not a derived default. */
  overridden: { title: boolean; description: boolean; image: boolean };
} {
  const url = tenantPublicUrl(tenant);

  const derivedDescription =
    tenant.tagline?.trim() ||
    tenant.description?.trim() ||
    `${tenant.name} auf Aera — tritt der Community bei und verpasse nichts.`;

  const derivedKeywords = [
    tenant.name,
    tenant.category ?? "",
    "Community",
    "Aera",
  ].filter(Boolean);

  return {
    title: clamp(tenant.seoTitle || tenant.name, MAX_TITLE),
    description: clamp(tenant.seoDescription || derivedDescription, MAX_DESCRIPTION),
    keywords: tenant.seoKeywords
      ? keywordList(tenant.seoKeywords)
      : derivedKeywords,
    // Without an override the generated card (opengraph-image.tsx: brand
    // colour, name, tagline) is the share image — a square logo would be
    // cropped to 1.91:1 by every network.
    imageUrl: tenant.seoImageUrl?.trim() || tenantShareImageUrl(tenant),
    url,
    noindex: tenant.seoNoindex,
    overridden: {
      title: Boolean(tenant.seoTitle?.trim()),
      description: Boolean(tenant.seoDescription?.trim()),
      image: Boolean(tenant.seoImageUrl?.trim()),
    },
  };
}

/** Options for one page inside a community. */
export interface TenantPageSeo {
  /** Page title; rendered as "{title} – {community}". Omit for the start page. */
  title?: string;
  /** Text the viewer is allowed to read. Never pass gated content here. */
  description?: string;
  /**
   * Path below the community's public address ("/s/forum/abc"). `""` is the
   * start page. `null` emits no canonical at all — used by the layout, whose
   * metadata every subpage inherits.
   */
  path: string | null;
  noindex?: boolean;
  /** Absolute image of the page (e.g. a public post cover). */
  image?: string | null;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
}

/**
 * Metadata for the community's pages. Like buildPlatformPageMetadata it
 * always returns the full set (Next merges shallowly), so og:image and
 * twitter:image are the same picture on every page: the page's own public
 * image, else the creator's SEO image, else the generated community card.
 */
export async function buildTenantMetadata(
  tenant: SeoTenant,
  page: TenantPageSeo = { path: "" },
): Promise<Metadata> {
  const platform = await getPlatformSeo();
  const seo = resolveTenantSeo(tenant);
  const base = env.APP_URL.replace(/\/+$/, "");
  const url = page.path === null ? null : `${seo.url}${page.path}`;
  const title = page.title
    ? clamp(`${page.title}${COMMUNITY_TITLE_SEPARATOR}${tenant.name}`, MAX_TITLE + 30)
    : seo.title;
  const description = clamp(page.description || seo.description, MAX_DESCRIPTION);
  const image =
    absoluteImage(page.image, base) ?? absoluteImage(seo.imageUrl, base) ?? tenantShareImageUrl(tenant);
  const isGeneratedCard = image === tenantShareImageUrl(tenant);
  const ogImage = isGeneratedCard ? { url: image, width: 1200, height: 630, alt: tenant.name } : { url: image };

  return {
    metadataBase: new URL(base),
    // Overrides the root template: a community page is its own brand, it should
    // not read "Community — Aera" in the tab.
    title: { absolute: title },
    description,
    keywords: seo.keywords,
    ...(url !== null ? { alternates: { canonical: url } } : {}),
    robots:
      seo.noindex || platform.noindex || page.noindex
        ? { index: false, follow: false }
        : { index: true, follow: true },
    // Installed from the community's own address, the home-screen icon is
    // labelled with the community, not with "Aera".
    appleWebApp: { capable: true, title: clamp(tenant.name, 30), statusBarStyle: "black-translucent" },
    openGraph: {
      type: page.type ?? "website",
      siteName: tenant.name,
      title,
      description,
      ...(url !== null ? { url } : {}),
      ...(page.publishedTime ? { publishedTime: page.publishedTime } : {}),
      ...(page.modifiedTime ? { modifiedTime: page.modifiedTime } : {}),
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

/**
 * One request-deduped lookup of a community's SEO fields by slug — the
 * layout and the page's generateMetadata both need it.
 */
export const getSeoTenant = cache(async function getSeoTenant(slug: string) {
  return prisma.tenant.findUnique({
    where: { slug, status: "ACTIVE" },
    select: { id: true, ...TENANT_SEO_SELECT },
  });
});

/** Shorthand for a community page: looks the tenant up and builds the set. */
export async function tenantPageMetadata(slug: string, page: TenantPageSeo): Promise<Metadata> {
  const tenant = await getSeoTenant(slug);
  if (!tenant) return {};
  return buildTenantMetadata(tenant, page);
}

// ---------------------------------------------------------------------------
// Host → community (web app manifest)
// ---------------------------------------------------------------------------

/**
 * Which community a request host belongs to, or null for the platform host.
 * Mirrors app/api/resolve-domain: <sub>.<root> matches a chosen subdomain
 * first, then a slug; any other host must be a VERIFIED custom domain.
 */
export async function tenantForHost(rawHost: string | null) {
  const host = (rawHost ?? "").split(":")[0]!.trim().toLowerCase();
  const root = env.ROOT_DOMAIN.toLowerCase();
  if (!host || host.length > 255) return null;
  if (host === root || host === `www.${root}` || host === "localhost" || host === "127.0.0.1") {
    return null;
  }
  try {
    if (new URL(env.APP_URL).hostname.toLowerCase() === host) return null;
  } catch {
    /* APP_URL is validated in lib/env; ignore a malformed value here. */
  }
  const select = { slug: true, name: true, tagline: true, primaryColor: true } as const;
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -1 * (root.length + 1));
    if (!sub || sub === "www" || sub === "app") return null;
    return (
      (await prisma.tenant.findFirst({ where: { subdomain: sub, status: "ACTIVE" }, select })) ??
      (await prisma.tenant.findFirst({ where: { slug: sub, status: "ACTIVE" }, select }))
    );
  }
  return prisma.tenant.findFirst({
    where: { customDomain: host, customDomainVerifiedAt: { not: null }, status: "ACTIVE" },
    select,
  });
}
