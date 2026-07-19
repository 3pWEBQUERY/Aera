import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Process liveness only. Railway readiness uses /api/health instead. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

