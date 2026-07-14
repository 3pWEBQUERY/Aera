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

async function resolveCustomDomain(req: NextRequest, host: string): Promise<string | null> {
  const cached = domainCache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.slug;
  try {
    const url = new URL(`/api/resolve-domain?host=${encodeURIComponent(host)}`, req.nextUrl.origin);
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const slug = res.ok ? ((await res.json()) as { slug: string | null }).slug : null;
    domainCache.set(host, { slug, expiresAt: Date.now() + DOMAIN_TTL_MS });
    return slug;
  } catch {
    return null;
  }
}

function isSharedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/_next")
  );
}

function rewriteToCommunity(req: NextRequest, slug: string) {
  const rewritten = req.nextUrl.clone();
  const path = req.nextUrl.pathname;
  rewritten.pathname = `/c/${slug}${path === "/" ? "" : path}`;
  return NextResponse.rewrite(rewritten);
}

export async function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0].toLowerCase();
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost").toLowerCase();
  const url = req.nextUrl;

  const isApex =
    hostname === root ||
    hostname === `www.${root}` ||
    hostname === "localhost" ||
    hostname === "127.0.0.1";

  if (isApex || isSharedPath(url.pathname)) return NextResponse.next();

  // Subdomain of the root domain -> direct rewrite.
  if (hostname.endsWith(`.${root}`)) {
    const sub = hostname.slice(0, -1 * (root.length + 1));
    if (sub && sub !== "www" && sub !== "app") {
      return rewriteToCommunity(req, sub);
    }
    return NextResponse.next();
  }

  // Anything else is a potential custom domain (Tenant.customDomain).
  const slug = await resolveCustomDomain(req, hostname);
  if (slug) return rewriteToCommunity(req, slug);

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
