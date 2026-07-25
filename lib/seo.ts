import "server-only";
import { cache } from "react";
import type { Metadata } from "next";
import { systemPrisma } from "./prisma";
import { env } from "./env";

/**
 * SEO for the platform and for every community.
 *
 * Two rules shape this file:
 *
 * 1. An empty override means "derive it", never "ship an empty tag". A creator
 *    who never opens the SEO page must still get correct, community-specific
 *    metadata built from what they entered during onboarding.
 * 2. Metadata is only worth having if it is *addressable*. Every page therefore
 *    gets a canonical URL, and a community on a verified custom domain
 *    canonicalises to that domain rather than to aera.so — otherwise the two
 *    copies compete with each other in the index.
 */

const MAX_TITLE = 70;
const MAX_DESCRIPTION = 200;

/** Built-in platform defaults. Used until an admin overrides them in /admin/seo. */
export const PLATFORM_SEO_DEFAULTS = {
  siteName: "Aera",
  title: "Aera — Deine Community. Deine Regeln. Deine Einnahmen.",
  titleTemplate: "%s — Aera",
  description:
    "Baue deine eigene Community mit Feed, Kursen, Events, Newsletter und Shop — auf deiner Domain, mit deinem Branding. Kostenlos starten, jederzeit wachsen.",
  keywords:
    "Community-Plattform, Creator, Mitgliedschaften, Online-Kurse, Newsletter, Events, Digitale Produkte",
  imageUrl: "/social/aera-x-community-banner-final.png",
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
  const row = await systemPrisma.platformSeo
    .findUnique({ where: { id: "platform" } })
    .catch(() => null);
  const d = PLATFORM_SEO_DEFAULTS;
  return {
    siteName: row?.siteName?.trim() || d.siteName,
    title: row?.title?.trim() || d.title,
    titleTemplate: row?.titleTemplate?.trim() || d.titleTemplate,
    description: row?.description?.trim() || d.description,
    keywords: row?.keywords?.trim() || d.keywords,
    imageUrl: row?.imageUrl?.trim() || d.imageUrl,
    twitterHandle: row?.twitterHandle?.trim() || d.twitterHandle,
    noindex: row?.noindex ?? d.noindex,
  };
});

export async function buildPlatformMetadata(): Promise<Metadata> {
  const seo = await getPlatformSeo();
  const base = env.APP_URL.replace(/\/+$/, "");
  const image = absoluteImage(seo.imageUrl, base);
  const handle = seo.twitterHandle.trim().replace(/^@?/, "@");

  return {
    // metadataBase turns every relative image/canonical below into an absolute
    // URL. Without it Next emits relative OG tags, which crawlers ignore.
    metadataBase: new URL(base),
    title: { default: seo.title, template: seo.titleTemplate },
    description: clamp(seo.description, MAX_DESCRIPTION),
    keywords: keywordList(seo.keywords),
    applicationName: seo.siteName,
    alternates: { canonical: "/" },
    robots: seo.noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: seo.siteName,
      title: seo.title,
      description: clamp(seo.description, MAX_DESCRIPTION),
      url: base,
      ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: seo.title,
      description: clamp(seo.description, MAX_DESCRIPTION),
      ...(handle.length > 1 ? { site: handle, creator: handle } : {}),
      ...(image ? { images: [image] } : {}),
    },
  };
}

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
export function tenantPublicUrl(tenant: SeoTenant): string {
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

/**
 * The effective values — override first, otherwise derived from what the
 * creator entered during onboarding. This is what both the rendered page and
 * the dashboard preview read, so the preview cannot drift from reality.
 */
export function resolveTenantSeo(tenant: SeoTenant): {
  title: string;
  description: string;
  keywords: string[];
  imageUrl: string | null;
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
    imageUrl: tenant.seoImageUrl?.trim() || tenant.logoUrl || null,
    url,
    noindex: tenant.seoNoindex,
    overridden: {
      title: Boolean(tenant.seoTitle?.trim()),
      description: Boolean(tenant.seoDescription?.trim()),
      image: Boolean(tenant.seoImageUrl?.trim()),
    },
  };
}

export async function buildTenantMetadata(tenant: SeoTenant): Promise<Metadata> {
  const platform = await getPlatformSeo();
  const seo = resolveTenantSeo(tenant);
  const base = env.APP_URL.replace(/\/+$/, "");
  const image =
    absoluteImage(seo.imageUrl, base) ?? absoluteImage(platform.imageUrl, base);

  return {
    metadataBase: new URL(base),
    // Overrides the root template: a community page is its own brand, it should
    // not read "Community — Aera" in the tab.
    title: { absolute: seo.title },
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: seo.url },
    robots:
      seo.noindex || platform.noindex
        ? { index: false, follow: false }
        : { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: tenant.name,
      title: seo.title,
      description: seo.description,
      url: seo.url,
      ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: seo.title,
      description: seo.description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
