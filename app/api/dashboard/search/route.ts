import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/guards";
import { rateLimit } from "@/lib/rate-limit";
import { MIN_QUERY, searchDashboard } from "@/lib/dashboard-search";

/**
 * GET /api/dashboard/search?slug=…&q=… — Live-Suche im Creator-Dashboard.
 *
 * requireTenantAdmin prueft die Zugehoerigkeit und setzt den Tenant-Kontext
 * fuer RLS; ohne Admin-Rolle in genau dieser Community kommt hier niemand
 * durch. Gedrosselt pro Nutzer und Community, weil bei einer Live-Suche pro
 * Tastendruck eine Anfrage entstehen kann.
 */
export const dynamic = "force-dynamic";

const LIMIT_PER_MINUTE = 120;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = String(url.searchParams.get("slug") ?? "");
  const q = String(url.searchParams.get("q") ?? "");
  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });

  if (q.trim().length < MIN_QUERY) {
    return NextResponse.json({ query: q, total: 0, groups: [] });
  }

  const { tenant, user } = await requireTenantAdmin(slug);

  if (!(await rateLimit(`dash-search:${user.id}:${tenant.id}`, LIMIT_PER_MINUTE, 60_000))) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const data = await searchDashboard(tenant.id, slug, q);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
