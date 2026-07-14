import "server-only";
import prisma from "./prisma";
import type { GamificationTrigger } from "@/app/generated/prisma/client";

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

async function evaluateBadges(tenantId: string, userId: string): Promise<void> {
  const badges = await prisma.badge.findMany({ where: { tenantId } });
  if (badges.length === 0) return;

  const [stats, postCount, commentCount] = await Promise.all([
    prisma.memberStats.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    }),
    prisma.post.count({ where: { tenantId, authorId: userId } }),
    prisma.comment.count({ where: { tenantId, authorId: userId } }),
  ]);
  const points = stats?.points ?? 0;

  for (const badge of badges) {
    const c = (badge.criteria ?? {}) as { type?: string; threshold?: number };
    const threshold = Number(c.threshold ?? 0);
    let earned = false;
    if (c.type === "points") earned = points >= threshold;
    else if (c.type === "posts") earned = postCount >= threshold;
    else if (c.type === "comments") earned = commentCount >= threshold;
    if (earned) {
      await prisma.badgeAward
        .create({ data: { tenantId, badgeId: badge.id, userId } })
        .catch(() => undefined); // unique(badgeId,userId) => ignore duplicates
    }
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
  if (rules.length === 0) return 0;

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

  if (total > 0) {
    await refreshStats(tenantId, userId);
    await evaluateBadges(tenantId, userId);
  }
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
