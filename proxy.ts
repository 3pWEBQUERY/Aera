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

const SHARED_PATH_PREFIXES = [
  "/api",
  "/_next",
  "/dashboard",
  "/admin",
  "/member",
  "/home",
  "/start",
  "/login",
  "/signup",
  "/forgot",
  "/reset",
  "/invite",
  "/verify",
  "/legal",
  "/unsubscribe",
  "/features",
  "/pricing",
  "/hilfe",
  "/impressum",
  "/agb",
  "/datenschutz",
  "/widerruf",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
] as const;

function isSharedPath(pathname: string): boolean {
  return SHARED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function rewriteToCommunity(req: NextRequest, slug: string) {
  const rewritten = req.nextUrl.clone();
  const path = req.nextUrl.pathname;
  const prefix = `/c/${slug}`;
  // Links inside a community hardcode /c/<slug>/… . When such a request arrives
  // on a subdomain or custom domain, the path already targets this community —
  // so do not add a second /c/<slug> prefix (that caused a 404). Both the clean
  // path (/s/blog) and the prefixed path (/c/<slug>/s/blog) resolve correctly.
  if (path === prefix || path.startsWith(`${prefix}/`)) {
    rewritten.pathname = path;
  } else {
    rewritten.pathname = `${prefix}${path === "/" ? "" : path}`;
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

  if (isApex || isSharedPath(url.pathname)) return NextResponse.next();

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
