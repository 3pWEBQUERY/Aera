import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * Resolves a custom domain to its tenant slug — used by the proxy to rewrite
 * custom-domain requests onto /c/{slug}. Public data (domain ↔ community).
 */
export async function GET(req: Request) {
  const host = new URL(req.url).searchParams.get("host")?.trim().toLowerCase();
  if (!host || host.length > 255) {
    return NextResponse.json({ slug: null }, { status: 400 });
  }
  // Nur verifizierte Domains auflösen — verhindert, dass fremde Domains
  // ungeprüft auf eine Community zeigen (Phishing-/Squatting-Schutz).
  const tenant = await prisma.tenant.findFirst({
    where: { customDomain: host, customDomainVerifiedAt: { not: null } },
    select: { slug: true },
  });
  return NextResponse.json(
    { slug: tenant?.slug ?? null },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
