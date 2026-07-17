import { nameStatus } from "@/lib/tenant-name";
import { jsonOk, requireMobileAuth } from "@/lib/mobile/api";

// GET /api/mobile/v1/communities/name-check?name=<name>
//   → { status: "available" | "taken" | "short" | "long" }
// Live-Verfügbarkeit eines Community-Namens (Creator-Tooling → Auth Pflicht).
// Mobile-Pendant zu app/api/tenant/name-check.

export async function GET(req: Request) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "";

  const status = await nameStatus(name);
  return jsonOk({ status });
}
