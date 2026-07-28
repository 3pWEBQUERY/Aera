import "server-only";
import prisma from "./prisma";
import { parseBadgeCriteria, type BadgeLook } from "./badges";

/**
 * Vergebene Auszeichnungen mehrerer Mitglieder in einer Abfrage.
 *
 * Die Mitgliederliste zeigt bis zu hundert Personen; eine Abfrage je Person
 * waere dort das Ende. Deshalb einmal alles holen und im Speicher nach
 * Benutzer sortieren.
 */
export interface MemberBadge extends BadgeLook {
  id: string;
  name: string;
  description: string | null;
}

export async function badgesForUsers(
  tenantId: string,
  userIds: string[],
  perUser = 6,
): Promise<Map<string, MemberBadge[]>> {
  const out = new Map<string, MemberBadge[]>();
  if (userIds.length === 0) return out;

  const awards = await prisma.badgeAward.findMany({
    where: { tenantId, userId: { in: userIds } },
    orderBy: { awardedAt: "desc" },
    include: { badge: { select: { id: true, name: true, description: true, criteria: true } } },
  });

  for (const award of awards) {
    const list = out.get(award.userId) ?? [];
    if (list.length >= perUser) continue;
    const c = parseBadgeCriteria(award.badge.criteria);
    list.push({
      id: award.badge.id,
      name: award.badge.name,
      description: award.badge.description,
      shape: c.shape,
      tier: c.tier,
      icon: c.icon,
    });
    out.set(award.userId, list);
  }
  return out;
}

/** Alle Auszeichnungen einer Person, neueste zuerst. */
export async function badgesForUser(
  tenantId: string,
  userId: string,
): Promise<MemberBadge[]> {
  return (await badgesForUsers(tenantId, [userId], 100)).get(userId) ?? [];
}
