import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Process liveness only. Railway uses this while activating a deployment;
 * continuous dependency monitoring uses /api/health/ready.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
