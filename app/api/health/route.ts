import { NextResponse } from "next/server";
import { getReadinessSnapshot } from "@/lib/readiness";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

export async function GET(): Promise<NextResponse> {
  const snapshot = await getReadinessSnapshot();
  return NextResponse.json(snapshot, {
    status: snapshot.status === "ok" ? 200 : 503,
    headers: HEADERS,
  });
}
