import prisma, { setTenantContext } from "@/lib/prisma";
import { getCommunityContext } from "@/lib/guards";
import { canAccess } from "@/lib/entitlements";

/**
 * Access resolution for the live-session chat REST route and SSE stream.
 * The session's LIVE space must be accessible; a session-level entitlement
 * key (if set) is additionally required for non-staff.
 */
export type LiveCtx = {
  community: NonNullable<Awaited<ReturnType<typeof getCommunityContext>>>;
  sessionId: string;
  spaceId: string;
};

export async function resolveLiveAccess(
  slug: string,
  sessionId: string,
): Promise<LiveCtx | null> {
  const community = await getCommunityContext(slug);
  if (!community || !community.user) return null;
  setTenantContext(community.tenant.id);

  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, tenantId: community.tenant.id },
    include: { space: true },
  });
  if (!session || !session.space) return null;
  if (!canAccess(session.space, community.ctx)) return null;
  if (
    session.requiredEntitlementKey &&
    !community.ctx.isStaff &&
    !community.ctx.keys.has(session.requiredEntitlementKey)
  ) {
    return null;
  }
  return { community, sessionId: session.id, spaceId: session.spaceId! };
}
