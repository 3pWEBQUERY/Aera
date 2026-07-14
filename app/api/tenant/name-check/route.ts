import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { nameStatus } from "@/lib/tenant-name";

// GET /api/tenant/name-check?name=<name>&exclude=<slug>
// Live availability of a community name (creator tooling → requires auth).
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "";
  const exclude = url.searchParams.get("exclude") ?? undefined;

  const status = await nameStatus(name, exclude);
  return NextResponse.json({ status });
}
