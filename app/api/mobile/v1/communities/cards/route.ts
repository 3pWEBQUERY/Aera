import prisma from "@/lib/prisma";
import { jsonError, jsonOk, mobileAuth } from "@/lib/mobile/api";
import {
  communityCoverMap,
  toCommunityCard,
  type CommunityCardDto,
} from "@/lib/mobile/serializers";
import type { Tenant } from "@/app/generated/prisma/client";

// GET /api/mobile/v1/communities/cards?slugs=a,b,c (Token optional, max 20 Slugs)
//   → { data: CommunityCard[] } in der Reihenfolge der angefragten Slugs.
// Für „Zuletzt besucht": der Client speichert Slugs lokal und hydriert hier.
// Unbekannte Slugs werden still übersprungen (Community gelöscht/umbenannt).

type TenantWithCount = Tenant & { _count: { memberships: number } };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slugs = [
    ...new Set(
      (url.searchParams.get("slugs") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (slugs.length === 0) return jsonOk({ data: [] });
  if (slugs.length > 20) {
    return jsonError("validation", "slugs: At most 20 slugs per request.", 400);
  }

  const user = await mobileAuth(req);
  const [tenants, myMemberships] = await Promise.all([
    prisma.tenant.findMany({
      where: { slug: { in: slugs } },
      include: { _count: { select: { memberships: true } } },
    }),
    user
      ? prisma.membership.findMany({
          where: { userId: user.id, status: "ACTIVE" },
          select: { tenantId: true },
        })
      : Promise.resolve([]),
  ]);
  const myIds = new Set(myMemberships.map((m) => m.tenantId));
  const covers = await communityCoverMap(tenants.map((t) => t.id));

  const bySlug = new Map(tenants.map((t) => [t.slug, t as TenantWithCount]));
  const data: CommunityCardDto[] = [];
  for (const slug of slugs) {
    const t = bySlug.get(slug);
    if (!t) continue;
    data.push(
      toCommunityCard(t, {
        coverUrl: covers.get(t.id) ?? null,
        memberCount: t._count.memberships,
        isMember: myIds.has(t.id),
      }),
    );
  }
  return jsonOk({ data });
}
