import prisma from "@/lib/prisma";
import { jsonError, jsonOk, mobileAuth, resolveTenant } from "@/lib/mobile/api";
import {
  activeAnnouncementFor,
  buildViewerContext,
  communityCoverMap,
  toCommunityCard,
  toSpaceSummary,
} from "@/lib/mobile/serializers";
import { isAnnouncementsOnly } from "@/lib/space-settings";

// GET /api/mobile/v1/c/{slug}
// → { community: CommunityCard & { description }, viewer, spaces, announcement }
// Token optional — Viewer/Gating je nach Mitgliedschaft.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await mobileAuth(req);
  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const [{ viewer, ctx }, allSpaces, memberCount, covers] = await Promise.all([
    buildViewerContext(tenant, user),
    prisma.space.findMany({
      where: { tenantId: tenant.id, isArchived: false },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.membership.count({ where: { tenantId: tenant.id, status: "ACTIVE" } }),
    communityCoverMap([tenant.id]),
  ]);

  // ADS und Banner-Container erscheinen nie in der Space-Liste; deren
  // Ansagen-Banner speisen aber das Announcement.
  const spaces = allSpaces.filter(
    (s) => s.type !== "ADS" && !isAnnouncementsOnly(s.settings),
  );

  return jsonOk({
    community: {
      ...toCommunityCard(tenant, {
        coverUrl: covers.get(tenant.id) ?? null,
        memberCount,
        isMember: viewer.isMember,
      }),
      description: tenant.description,
    },
    viewer,
    spaces: spaces.map((s) => toSpaceSummary(s, ctx)),
    announcement: activeAnnouncementFor(allSpaces),
  });
}
