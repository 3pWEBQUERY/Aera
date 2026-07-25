import { NextRequest, NextResponse } from "next/server";

/**
 * Host-based routing:
 * - slug.aera.so   -> /c/slug (subdomains, no DB lookup needed)
 * - customdomain   -> /c/{slug} (resolved via /api/resolve-domain, cached)
 * The marketing site and dashboard stay on the apex/app domain.
 * Path-based /c/slug works out of the box in local development.
 */

// Per-instance cache for custom-domain lookups (60s TTL).
const domainCache = new Map<string, { slug: string | null; expiresAt: number }>();
const DOMAIN_TTL_MS = 60_000;
const DOMAIN_CACHE_MAX = 2_000;
const RESOLVER_TIMEOUT_MS = 3_000;

function cacheResolvedHost(host: string, slug: string | null): void {
  const now = Date.now();
  if (domainCache.size >= DOMAIN_CACHE_MAX) {
    for (const [key, entry] of domainCache) {
      if (entry.expiresAt <= now) domainCache.delete(key);
    }
  }
  while (domainCache.size >= DOMAIN_CACHE_MAX) {
    const oldest = domainCache.keys().next().value as string | undefined;
    if (!oldest) break;
    domainCache.delete(oldest);
  }
  domainCache.set(host, { slug, expiresAt: now + DOMAIN_TTL_MS });
}

/**
 * The resolver target must come exclusively from trusted deployment config.
 * Never derive it from req.nextUrl.origin/Host: Host is attacker-controlled
 * and would turn the proxy's server-side fetch into an SSRF primitive.
 */
function domainResolverOrigin(): string | null {
  const configured = (
    process.env.DOMAIN_RESOLVER_ORIGIN ??
    process.env.APP_URL ??
    ""
  ).trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

async function resolveHost(host: string): Promise<string | null> {
  const cached = domainCache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.slug;
  const origin = domainResolverOrigin();
  if (!origin) return null;
  try {
    const url = new URL("/api/resolve-domain", origin);
    url.searchParams.set("host", host);
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(RESOLVER_TIMEOUT_MS),
    });
    const candidate = res.ok
      ? ((await res.json()) as { slug?: unknown }).slug
      : null;
    const slug =
      typeof candidate === "string" &&
      /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(candidate)
        ? candidate
        : null;
    cacheResolvedHost(host, slug);
    return slug;
  } catch {
    return null;
  }
}

/**
 * Paths that must work on EVERY host and are never redirected away:
 *
 * - /api, /_next  — community pages fetch these relative; a cross-origin
 *   redirect would break POSTs and server actions.
 * - auth routes   — a member joining on a custom domain has to be able to log
 *   in there; that host needs its own session.
 * - legal/help    — linked from community footers and embedded in the purchase
 *   consent flow, where bouncing off-domain mid-checkout would be hostile.
 * - robots/sitemap/manifest — deliberately per-host.
 */
const HOST_NEUTRAL_PREFIXES = [
  "/api",
  "/_next",
  "/login",
  "/signup",
  "/forgot",
  "/reset",
  "/invite",
  "/verify",
  "/legal",
  "/unsubscribe",
  "/hilfe",
  "/impressum",
  "/agb",
  "/datenschutz",
  "/widerruf",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
] as const;

/**
 * Platform surfaces that belong on the apex. Served on a tenant host they
 * produce URLs like tenant.aera.so/home whose relative links then keep the
 * wrong host — which is how /home's "Deine Communities" ended up linking to
 * tenant.aera.so/c/other. They also duplicate the same content under every
 * tenant host for search engines.
 */
const PLATFORM_ONLY_PREFIXES = [
  "/home",
  "/member",
  "/dashboard",
  "/admin",
  "/start",
  "/features",
  "/pricing",
] as const;

function matchesPrefix(
  pathname: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** The canonical platform origin, from trusted deployment config only. */
function apexOrigin(): string | null {
  const configured = (process.env.APP_URL ?? "").trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Everything shipped in public/ — flags, logos, icons, 404 backdrops, sw.js —
 * must be served as-is on every host.
 *
 * Without this the community rewrite turns `tenant.aera.so/flags/de.svg` into
 * `/c/tenant/flags/de.svg`, which does not exist: every static asset 404s on
 * subdomains and custom domains while working fine on the apex.
 *
 * Matching "the last segment carries a file extension" instead of listing the
 * asset folders keeps this true for files added later. Community paths never
 * contain a dot — slugs come from slugify() ([a-z0-9-]) and ids are cuids — so
 * this cannot swallow real tenant content.
 */
function isStaticAsset(pathname: string): boolean {
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return lastSegment.includes(".");
}

function rewriteToCommunity(req: NextRequest, slug: string) {
  const rewritten = req.nextUrl.clone();
  const path = req.nextUrl.pathname;

  // A /c/<slug> path already names the community it wants — on ANY host. Only
  // host-relative paths (/s/blog, /join, /) belong to the host's community and
  // need the prefix.
  //
  // This used to special-case only the host's own slug, so a link to a
  // different community from a tenant domain became /c/thegnd/c/visiocom and
  // 404'd. That is exactly what "Deine Communities" on /home links to, which
  // made every other community unreachable from a tenant host.
  if (path === "/c" || path.startsWith("/c/")) {
    rewritten.pathname = path;
  } else {
    rewritten.pathname = `/c/${slug}${path === "/" ? "" : path}`;
  }
  return NextResponse.rewrite(rewritten);
}

function unknownTenantHost(): NextResponse {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0].toLowerCase();
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[/:].*$/, "")
    .toLowerCase();
  const url = req.nextUrl;

  const isApex =
    hostname === root ||
    hostname === `www.${root}` ||
    hostname === "localhost" ||
    hostname === "127.0.0.1";

  if (isApex) return NextResponse.next();

  if (
    isStaticAsset(url.pathname) ||
    matchesPrefix(url.pathname, HOST_NEUTRAL_PREFIXES)
  ) {
    return NextResponse.next();
  }

  // Platform pages belong on the apex. Only safe methods are redirected: a
  // server action POST bounced cross-origin would fail its Origin check, so
  // those are left alone rather than turned into a confusing error.
  if (matchesPrefix(url.pathname, PLATFORM_ONLY_PREFIXES)) {
    const origin = apexOrigin();
    if (origin && (req.method === "GET" || req.method === "HEAD")) {
      return NextResponse.redirect(
        new URL(`${url.pathname}${url.search}`, origin),
        308,
      );
    }
    return NextResponse.next();
  }

  // Subdomain of the root domain -> resolve to a community. Matches a tenant
  // by its chosen subdomain OR its slug (default address). A failed resolver
  // must never fall back to the raw label: it could collide with another
  // tenant's slug and route the request to the wrong community.
  if (hostname.endsWith(`.${root}`)) {
    const sub = hostname.slice(0, -1 * (root.length + 1));
    if (sub && sub !== "www" && sub !== "app") {
      const resolved = await resolveHost(hostname);
      return resolved ? rewriteToCommunity(req, resolved) : unknownTenantHost();
    }
    return NextResponse.next();
  }

  // Anything else is a potential custom domain (Tenant.customDomain).
  const slug = await resolveHost(hostname);
  if (slug) return rewriteToCommunity(req, slug);

  return unknownTenantHost();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
