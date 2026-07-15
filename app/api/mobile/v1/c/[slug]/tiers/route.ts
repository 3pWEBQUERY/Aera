import { jsonError, jsonOk, mobileAuth, resolveTenant } from "@/lib/mobile/api";
import { buildViewerContext, tierDtos } from "@/lib/mobile/serializers";

// GET /api/mobile/v1/c/{slug}/tiers → { data: Tier[] } (Token optional)

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await mobileAuth(req);
  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const { ctx } = await buildViewerContext(tenant, user);
  return jsonOk({ data: await tierDtos(tenant, ctx.membership) });
}
