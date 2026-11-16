import { jsonError, jsonOk, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";
import { buildViewerContext, conversationDtos } from "@/lib/mobile/serializers";
import { withTenantContext } from "@/lib/prisma";

// GET /api/mobile/v1/c/{slug}/chat → { conversations: Conversation[] }
// Zugängliche Gruppen-Chats (CHAT-Spaces, Gate wie resolveChatAccess) + DMs.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);
  return withTenantContext(tenant.id, async () => {
    const { ctx } = await buildViewerContext(tenant, auth.user);
    return jsonOk({ conversations: await conversationDtos(tenant, ctx, auth.user) });
  });
}
