import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { searchPlatform, MIN_QUERY } from "@/lib/discover-search";

/**
 * GET /api/search?q=… — live discovery search.
 *
 * Public by design (logged-out visitors should be able to find communities),
 * so it is rate limited per client and only ever returns public content; see
 * lib/discover-search.ts for the visibility rules.
 */
export const dynamic = "force-dynamic";

const LIMIT_PER_MINUTE = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";

  if (q.trim().length < MIN_QUERY) {
    return NextResponse.json({ query: q, total: 0, results: [] });
  }

  const head = await headers();
  const client =
    head.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    head.get("x-real-ip") ||
    "anonymous";
  if (!(await rateLimit(`search:${client}`, LIMIT_PER_MINUTE, 60_000))) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const data = await searchPlatform(q);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
