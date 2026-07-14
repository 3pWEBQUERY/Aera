import prisma, { setTenantContext } from "@/lib/prisma";
import { getCommunityContext } from "@/lib/guards";
import { canAccess } from "@/lib/entitlements";
import { parseChatSettings, type ChatSettings } from "@/lib/space-settings";
import { isDirectMember } from "@/lib/chat";

/**
 * Gemeinsame Zugriffs-Auflösung für die Chat-REST-Route und den SSE-Stream:
 * Gruppen-Chats sind über die Space-Sichtbarkeit gegated, Direktnachrichten
 * erfordern Teilnahme an der Konversation.
 */

export type GroupCtx = {
  kind: "space";
  community: NonNullable<Awaited<ReturnType<typeof getCommunityContext>>>;
  id: string;
  settings: ChatSettings;
};
export type DirectCtx = {
  kind: "dm";
  community: NonNullable<Awaited<ReturnType<typeof getCommunityContext>>>;
  id: string;
};

export async function resolveChatAccess(
  slug: string,
  spaceId: string | null,
  dmId: string | null,
): Promise<GroupCtx | DirectCtx | null> {
  const community = await getCommunityContext(slug);
  if (!community || !community.user) return null;
  setTenantContext(community.tenant.id);

  if (dmId) {
    const ok = await isDirectMember(community.tenant.id, dmId, community.user.id);
    return ok ? { kind: "dm", community, id: dmId } : null;
  }
  if (spaceId) {
    const space = await prisma.space.findFirst({
      where: { id: spaceId, tenantId: community.tenant.id, type: "CHAT", isArchived: false },
    });
    if (!space || !canAccess(space, community.ctx)) return null;
    return { kind: "space", community, id: space.id, settings: parseChatSettings(space.settings) };
  }
  return null;
}
