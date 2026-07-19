import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { env } from "@/lib/env";

/**
 * Resolves an incoming host to its community slug — used by the proxy to
 * rewrite requests onto /c/{slug}. Two cases:
 *  - <sub>.<root>   → tenant whose chosen `subdomain` is <sub>, else whose
 *                     `slug` is <sub> (the default address).
 *  - custom domain  → tenant whose verified `customDomain` matches the host.
 * Public data (host ↔ community).
 */
export async function GET(req: Request) {
  const host = new URL(req.url).searchParams.get("host")?.trim().toLowerCase();
  if (!host || host.length > 255) {
    return NextResponse.json({ slug: null }, { status: 400 });
  }
  const root = env.ROOT_DOMAIN.toLowerCase();
  let slug: string | null = null;

  if (host === root || host === `www.${root}`) {
    slug = null;
  } else if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -1 * (root.length + 1));
    if (sub) {
      // Explicit subdomain wins over a same-named slug (squatting-safe).
      const bySub = await prisma.tenant.findFirst({
        where: { subdomain: sub, status: "ACTIVE" },
        select: { slug: true },
      });
      if (bySub) {
        slug = bySub.slug;
      } else {
        const bySlug = await prisma.tenant.findFirst({
          where: { slug: sub, status: "ACTIVE" },
          select: { slug: true },
        });
        slug = bySlug?.slug ?? null;
      }
    }
  } else {
    // Verified custom domains only (phishing/squatting protection).
    const tenant = await prisma.tenant.findFirst({
      where: {
        customDomain: host,
        customDomainVerifiedAt: { not: null },
        status: "ACTIVE",
      },
      select: { slug: true },
    });
    slug = tenant?.slug ?? null;
  }

  return NextResponse.json(
    { slug },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
