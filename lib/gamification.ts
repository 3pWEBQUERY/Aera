import "server-only";
import prisma from "./prisma";
import type { GamificationTrigger } from "@/app/generated/prisma/client";
import { parseBadgeCriteria, type BadgeCriteriaType } from "./badges";

/** Resolve the level name for a given point total within a tenant. */
export async function levelForPoints(
  tenantId: string,
  points: number,
): Promise<string | null> {
  const level = await prisma.level.findFirst({
    where: { tenantId, minPoints: { lte: points } },
    orderBy: { minPoints: "desc" },
  });
  return level?.name ?? null;
}

async function refreshStats(tenantId: string, userId: string): Promise<void> {
  const agg = await prisma.pointsLedger.aggregate({
    where: { tenantId, userId },
    _sum: { points: true },
  });
  const points = agg._sum.points ?? 0;
  const levelName = await levelForPoints(tenantId, points);
  await prisma.memberStats.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    create: { tenantId, userId, points, levelName, lastActiveOn: new Date() },
    update: { points, levelName, lastActiveOn: new Date() },
  });
}

/**
 * Zaehlt alles, woran eine Auszeichnung haengen kann.
 *
 * Bewusst frisch gezaehlt statt fortgeschrieben: die Zahlen aendern sich auch
 * durch Loeschungen, und ein Zaehler, der nur hochgeht, verspricht Dinge, die
 * nicht mehr stimmen. Die Abfragen laufen nebenlaeufig und nur dann, wenn es
 * ueberhaupt eine Auszeichnung dieser Art gibt.
 */
async function badgeCounters(
  tenantId: string,
  userId: string,
  needed: Set<BadgeCriteriaType>,
): Promise<Record<BadgeCriteriaType, number>> {
  const zero = 0;
  const need = (t: BadgeCriteriaType) => needed.has(t);

  const [stats, posts, comments, likesGiven, membership] = await Promise.all([
    need("points")
      ? prisma.memberStats.findUnique({ where: { tenantId_userId: { tenantId, userId } } })
      : Promise.resolve(null),
    need("posts")
      ? prisma.post.count({ where: { tenantId, authorId: userId } })
      : Promise.resolve(zero),
    need("comments")
      ? prisma.comment.count({ where: { tenantId, authorId: userId } })
      : Promise.resolve(zero),
    need("likesGiven")
      ? prisma.reaction.count({ where: { tenantId, userId, type: "LIKE" } })
      : Promise.resolve(zero),
    need("memberDays")
      ? prisma.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } } })
      : Promise.resolve(null),
  ]);

  // Erhaltene Likes: auf eigenen Beitraegen und eigenen Kommentaren. Zwei
  // Abfragen statt eines Joins — Reaction kennt beide Wege getrennt.
  let likesReceived = zero;
  if (need("likesReceived")) {
    const [onPosts, onComments] = await Promise.all([
      prisma.reaction.count({
        where: { tenantId, type: "LIKE", post: { authorId: userId } },
      }),
      prisma.reaction.count({
        where: { tenantId, type: "LIKE", comment: { authorId: userId } },
      }),
    ]);
    likesReceived = onPosts + onComments;
  }

  const lessonsCompleted =
    need("lessonsCompleted") || need("coursesCompleted")
      ? await prisma.lessonProgress.count({ where: { tenantId, userId } })
      : zero;

  // Ein Kurs zaehlt als abgeschlossen, wenn keine seiner Lektionen mehr offen
  // ist. Kurse ohne Lektionen zaehlen nicht — sonst waere jeder leere Kurs
  // sofort "geschafft".
  let coursesCompleted = zero;
  if (need("coursesCompleted") && lessonsCompleted > 0) {
    const courses = await prisma.course.findMany({
      where: { tenantId, lessons: { some: {} } },
      select: {
        id: true,
        _count: { select: { lessons: true } },
        lessons: { select: { progress: { where: { userId }, select: { id: true } } } },
      },
    });
    coursesCompleted = courses.filter(
      (course) =>
        course._count.lessons > 0 &&
        course.lessons.every((lesson) => lesson.progress.length > 0),
    ).length;
  }

  const memberDays = membership
    ? Math.floor((Date.now() - membership.joinedAt.getTime()) / 86_400_000)
    : zero;

  return {
    points: stats?.points ?? zero,
    posts,
    comments,
    likesGiven,
    likesReceived,
    coursesCompleted,
    lessonsCompleted,
    memberDays,
    manual: zero,
  };
}

/**
 * Vergibt alle Auszeichnungen, deren Bedingung erfuellt ist.
 *
 * Von Hand vergebene Auszeichnungen ("manual") bleiben unberuehrt — die
 * entscheidet der Creator, nicht der Zaehler. Einmal Vergebenes wird nie
 * zurueckgenommen: eine Auszeichnung ist eine Erinnerung an ein Ereignis,
 * kein Statusanzeiger.
 */
export async function evaluateBadges(tenantId: string, userId: string): Promise<void> {
  const badges = await prisma.badge.findMany({ where: { tenantId } });
  if (badges.length === 0) return;

  const parsed = badges.map((badge) => ({ badge, c: parseBadgeCriteria(badge.criteria) }));
  const automatic = parsed.filter((x) => x.c.type !== "manual" && x.c.threshold > 0);
  if (automatic.length === 0) return;

  const owned = new Set(
    (
      await prisma.badgeAward.findMany({
        where: { tenantId, userId },
        select: { badgeId: true },
      })
    ).map((a) => a.badgeId),
  );
  const open = automatic.filter((x) => !owned.has(x.badge.id));
  if (open.length === 0) return;

  const counters = await badgeCounters(
    tenantId,
    userId,
    new Set(open.map((x) => x.c.type)),
  );

  for (const { badge, c } of open) {
    if (counters[c.type] < c.threshold) continue;
    await prisma.badgeAward
      .create({ data: { tenantId, badgeId: badge.id, userId } })
      .catch(() => undefined); // unique(badgeId,userId) => Doppelte ignorieren
  }
}

/**
 * Award points for a triggered action, honoring the tenant's active rule and
 * its per-day cap. Updates aggregated stats and evaluates badges.
 */
export async function awardPoints(input: {
  tenantId: string;
  userId: string;
  trigger: GamificationTrigger;
  refType?: string;
  refId?: string;
}): Promise<number> {
  const { tenantId, userId, trigger } = input;
  // A trigger may have several active rules (e.g. a base rule + bonus rules).
  // Each awards independently and honours its own per-day cap; points stack.
  const rules = await prisma.gamificationRule.findMany({
    where: { tenantId, trigger, isActive: true },
  });
  if (rules.length === 0) {
    await evaluateBadges(tenantId, userId);
    return 0;
  }

  let total = 0;
  for (const rule of rules) {
    if (rule.points === 0) continue;
    if (rule.maxPerDay && rule.maxPerDay > 0) {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const todays = await prisma.pointsLedger.count({
        where: { tenantId, userId, ruleId: rule.id, createdAt: { gte: since } },
      });
      if (todays >= rule.maxPerDay) continue;
    }
    const dedupeKey =
      input.refType && input.refId
        ? `${tenantId}:${userId}:${rule.id}:${input.refType}:${input.refId}`
        : null;
    try {
      await prisma.pointsLedger.create({
        data: {
          tenantId,
          userId,
          points: rule.points,
          reason: rule.name,
          ruleId: rule.id,
          refType: input.refType,
          refId: input.refId,
          dedupeKey,
        },
      });
    } catch (error) {
      if (
        dedupeKey &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
    total += rule.points;
  }

  if (total > 0) await refreshStats(tenantId, userId);
  // Auszeichnungen haengen an der Tat, nicht an der Punkteregel: auch wenn
  // gerade keine Punkte flossen (Regel aus, Tageslimit erreicht), zaehlt der
  // Beitrag fuer "10 Beitraege geschrieben".
  await evaluateBadges(tenantId, userId);
  return total;
}

/**
 * Append negative ledger entries for a refunded purchase. Original entries
 * remain intact; unique reversal keys make Stripe retries harmless.
 */
export async function reversePointsByReference(input: {
  tenantId: string;
  userId: string;
  refType: string;
  refId: string;
  reversalRefId: string;
}): Promise<number> {
  const originals = await prisma.pointsLedger.findMany({
    where: {
      tenantId: input.tenantId,
      userId: input.userId,
      refType: input.refType,
      refId: input.refId,
      points: { gt: 0 },
    },
  });
  let reversed = 0;
  for (const original of originals) {
    const dedupeKey = `reversal:${original.dedupeKey ?? original.id}`;
    try {
      await prisma.pointsLedger.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          points: -original.points,
          reason: `Stornierung: ${original.reason}`,
          refType: "StripeRefund",
          refId: input.reversalRefId,
          dedupeKey,
        },
      });
      reversed += original.points;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }
  if (reversed > 0) await refreshStats(input.tenantId, input.userId);
  return reversed;
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
  levelName: string | null;
}

export async function leaderboard(
  tenantId: string,
  limit = 20,
): Promise<LeaderboardRow[]> {
  const rows = await prisma.memberStats.findMany({
    where: { tenantId, points: { gt: 0 } },
    orderBy: { points: "desc" },
    take: limit,
    include: { user: { select: { name: true, avatarUrl: true } } },
  });
  return rows.map((r) => ({
    userId: r.userId,
    name: r.user.name,
    avatarUrl: r.user.avatarUrl,
    points: r.points,
    levelName: r.levelName,
  }));
}
