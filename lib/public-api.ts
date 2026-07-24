import "server-only";
import { NextResponse } from "next/server";
import { setTenantContext } from "./prisma";
import { authenticateApiRequest } from "./api-keys";
import { rateLimit } from "./rate-limit";
import { tenantHasFeature } from "./plan";
import type { Tenant } from "@/app/generated/prisma/client";

/**
 * Gemeinsamer Rahmen für alle /api/v1-Routen: Key-Auth, Rate-Limit,
 * Tenant-Kontext (RLS) und einheitliche Fehlerantworten.
 */

const RATE_LIMIT = 120; // Requests pro Minute und Key

export interface ApiContext {
  tenant: Tenant;
  keyId: string;
  /** Cursor-Pagination aus ?limit= & ?cursor= (Defaults: 50, max 100). */
  limit: number;
  cursor: string | null;
}

export async function withApiAuth(
  req: Request,
  handler: (ctx: ApiContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  const auth = await authenticateApiRequest(req);
  if (!auth) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Invalid or missing API key." } },
      { status: 401 },
    );
  }
  if (!(await rateLimit(`api:${auth.keyId}`, RATE_LIMIT, 60_000))) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Too many requests." } },
      { status: 429 },
    );
  }
  // Package gate: keys minted on a higher package must stop working after a
  // downgrade — otherwise the API is a permanent bypass of the paywall.
  if (!(await tenantHasFeature(auth.tenant.id, "developers"))) {
    return NextResponse.json(
      {
        error: {
          code: "plan_upgrade_required",
          message: "The public API requires a higher creator package.",
        },
      },
      { status: 402 },
    );
  }
  setTenantContext(auth.tenant.id);

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 50, 1),
    100,
  );
  const cursor = url.searchParams.get("cursor");

  try {
    return await handler({ tenant: auth.tenant, keyId: auth.keyId, limit, cursor });
  } catch (e) {
    console.error("Public API error:", e);
    return NextResponse.json(
      { error: { code: "internal", message: "Internal server error." } },
      { status: 500 },
    );
  }
}

/** Einheitliche Listen-Antwort mit Cursor-Pagination. */
export function listResponse<T extends { id: string }>(
  data: T[],
  limit: number,
): NextResponse {
  const hasMore = data.length > limit;
  const page = hasMore ? data.slice(0, limit) : data;
  return NextResponse.json({
    data: page,
    hasMore,
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  });
}
