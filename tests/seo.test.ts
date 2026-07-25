import { describe, it, expect, vi, beforeEach } from "vitest";

const seoMocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: {},
  systemPrisma: { platformSeo: { findUnique: seoMocks.findUnique } },
}));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://aera.so", ROOT_DOMAIN: "aera.so" },
}));
// getPlatformSeo is React-cached; a fresh module per test keeps the cache honest.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

import {
  resolveTenantSeo,
  tenantPublicUrl,
  buildTenantMetadata,
  buildPlatformMetadata,
  PLATFORM_SEO_DEFAULTS,
  type SeoTenant,
} from "@/lib/seo";

function tenant(overrides: Partial<SeoTenant> = {}): SeoTenant {
  return {
    name: "Design Circle",
    slug: "design-circle",
    subdomain: null,
    customDomain: null,
    customDomainVerifiedAt: null,
    tagline: "Wöchentliche Kritik-Runden für Produktdesigner",
    description: "Eine lange Beschreibung der Community.",
    logoUrl: "https://cdn.test/logo.png",
    category: "design",
    seoTitle: null,
    seoDescription: null,
    seoKeywords: null,
    seoImageUrl: null,
    seoNoindex: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  seoMocks.findUnique.mockResolvedValue(null);
});

describe("canonical URL", () => {
  it("prefers a VERIFIED custom domain", () => {
    expect(
      tenantPublicUrl(
        tenant({
          customDomain: "designcircle.com",
          customDomainVerifiedAt: new Date("2026-01-01"),
          subdomain: "dc",
        }),
      ),
    ).toBe("https://designcircle.com");
  });

  it("ignores an unverified custom domain — it does not resolve yet", () => {
    // Canonicalising to a dead host would deindex the community.
    expect(
      tenantPublicUrl(
        tenant({ customDomain: "not-yet.com", customDomainVerifiedAt: null }),
      ),
    ).toBe("https://design-circle.aera.so");
  });

  it("uses the chosen subdomain before the slug", () => {
    expect(tenantPublicUrl(tenant({ subdomain: "dc" }))).toBe("https://dc.aera.so");
  });
});

describe("derived defaults (nothing filled in by the creator)", () => {
  it("builds title, description, keywords and image from onboarding data", () => {
    const seo = resolveTenantSeo(tenant());
    expect(seo.title).toBe("Design Circle");
    expect(seo.description).toBe("Wöchentliche Kritik-Runden für Produktdesigner");
    expect(seo.keywords).toEqual(["Design Circle", "design", "Community", "Aera"]);
    expect(seo.imageUrl).toBe("https://cdn.test/logo.png");
    expect(seo.overridden).toEqual({ title: false, description: false, image: false });
  });

  it("falls back to the description, then to a sentence — never to empty", () => {
    expect(resolveTenantSeo(tenant({ tagline: null })).description).toBe(
      "Eine lange Beschreibung der Community.",
    );
    const bare = resolveTenantSeo(tenant({ tagline: null, description: null }));
    expect(bare.description).toContain("Design Circle");
    expect(bare.description.length).toBeGreaterThan(0);
  });
});

describe("overrides", () => {
  it("win over the derived values and are reported as overridden", () => {
    const seo = resolveTenantSeo(
      tenant({
        seoTitle: "Design Circle — Kritik, die weiterbringt",
        seoDescription: "Jede Woche echtes Feedback von Profis.",
        seoKeywords: "design, feedback , kritik,",
        seoImageUrl: "https://cdn.test/og.png",
      }),
    );
    expect(seo.title).toBe("Design Circle — Kritik, die weiterbringt");
    expect(seo.description).toBe("Jede Woche echtes Feedback von Profis.");
    // Leere Eintraege und Rand-Leerzeichen fliegen raus.
    expect(seo.keywords).toEqual(["design", "feedback", "kritik"]);
    expect(seo.imageUrl).toBe("https://cdn.test/og.png");
    expect(seo.overridden).toEqual({ title: true, description: true, image: true });
  });

  it("clamps an overlong title on a word boundary", () => {
    const long = "Design ".repeat(30).trim();
    const seo = resolveTenantSeo(tenant({ seoTitle: long }));
    expect(seo.title.length).toBeLessThanOrEqual(70);
    expect(seo.title.endsWith("…")).toBe(true);
    expect(seo.title).not.toMatch(/\s…$/);
  });
});

describe("tenant metadata", () => {
  it("emits canonical, OG and Twitter with an absolute image", async () => {
    const meta = await buildTenantMetadata(tenant());
    expect(meta.alternates?.canonical).toBe("https://design-circle.aera.so");
    expect(meta.openGraph?.url).toBe("https://design-circle.aera.so");
    expect(meta.title).toEqual({ absolute: "Design Circle" });
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(JSON.stringify(meta.openGraph)).toContain("https://cdn.test/logo.png");
    expect((meta.twitter as { card?: string }).card).toBe("summary_large_image");
  });

  it("falls back to the platform image when the community has none", async () => {
    const meta = await buildTenantMetadata(tenant({ logoUrl: null }));
    // Relative platform default must be made absolute for crawlers.
    expect(JSON.stringify(meta.openGraph)).toContain(
      `https://aera.so${PLATFORM_SEO_DEFAULTS.imageUrl}`,
    );
  });

  it("honours the creator's noindex", async () => {
    const meta = await buildTenantMetadata(tenant({ seoNoindex: true }));
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("lets the platform kill switch override a community that wants indexing", async () => {
    seoMocks.findUnique.mockResolvedValue({ noindex: true });
    const meta = await buildTenantMetadata(tenant({ seoNoindex: false }));
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe("platform metadata", () => {
  it("uses the built-in defaults when no row exists", async () => {
    const meta = await buildPlatformMetadata();
    expect(meta.title).toEqual({
      default: PLATFORM_SEO_DEFAULTS.title,
      template: PLATFORM_SEO_DEFAULTS.titleTemplate,
    });
    expect(meta.metadataBase?.toString()).toBe("https://aera.so/");
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it("prefers stored values and normalises the twitter handle", async () => {
    seoMocks.findUnique.mockResolvedValue({
      siteName: "Aera",
      title: "Eigener Titel",
      titleTemplate: "%s | Aera",
      description: "Eigene Beschreibung",
      keywords: "a, b",
      imageUrl: "https://cdn.test/platform.png",
      twitterHandle: "aera",
      noindex: false,
    });
    const meta = await buildPlatformMetadata();
    expect(meta.title).toEqual({ default: "Eigener Titel", template: "%s | Aera" });
    expect(meta.keywords).toEqual(["a", "b"]);
    expect((meta.twitter as { site?: string }).site).toBe("@aera");
  });

  it("blanks out to defaults instead of shipping empty tags", async () => {
    seoMocks.findUnique.mockResolvedValue({
      siteName: "   ", title: "", description: null, keywords: "",
      imageUrl: "", titleTemplate: "", twitterHandle: "", noindex: false,
    });
    const meta = await buildPlatformMetadata();
    expect(meta.title).toEqual({
      default: PLATFORM_SEO_DEFAULTS.title,
      template: PLATFORM_SEO_DEFAULTS.titleTemplate,
    });
    expect(meta.description).toBe(PLATFORM_SEO_DEFAULTS.description);
  });
});
