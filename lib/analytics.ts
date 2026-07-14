import "server-only";
import prisma from "./prisma";

/**
 * Creator-Analytics: alle Kennzahlen werden on-the-fly aus den vorhandenen
 * Tabellen berechnet (keine zusätzlichen Tracking-Tabellen nötig).
 */

const DAY = 86_400_000;

function monthsBack(n: number): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - n);
  return d;
}

const monthFmt = new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" });

export interface MonthBucket {
  label: string;
  value: number;
}

export interface CourseStat {
  id: string;
  title: string;
  lessonCount: number;
  students: number;
  /** 0–100: abgeschlossene Lektionen / (Teilnehmer × Lektionen). */
  completionRate: number;
}

export interface CampaignStat {
  id: string;
  subject: string;
  sentAt: string | null;
  recipients: number;
  delivered: number;
  opened: number;
  clicked: number;
}

export interface AnalyticsSummary {
  // Monetarisierung
  mrrCents: number;
  activeSubscriptions: number;
  revenue30dCents: number;
  revenueTotalCents: number;
  orders30d: number;
  churnRate30d: number; // 0–100
  // Mitglieder
  activeMembers: number;
  newMembers30d: number;
  memberGrowth: MonthBucket[]; // letzte 6 Monate, Beitritte
  // Engagement (30 Tage, mit Vergleich zu den 30 Tagen davor)
  posts30d: number;
  postsPrev30d: number;
  comments30d: number;
  commentsPrev30d: number;
  reactions30d: number;
  reactionsPrev30d: number;
  // Kurse & Newsletter
  courses: CourseStat[];
  campaigns: CampaignStat[];
}

export async function getAnalyticsSummary(tenantId: string): Promise<AnalyticsSummary> {
  const now = Date.now();
  const d30 = new Date(now - 30 * DAY);
  const d60 = new Date(now - 60 * DAY);

  const [
    activeSubs,
    canceled30d,
    paidOrders,
    activeMembers,
    newMembers30d,
    joins6m,
    posts30d,
    postsPrev,
    comments30d,
    commentsPrev,
    reactions30d,
    reactionsPrev,
    courses,
    campaignsRaw,
  ] = await Promise.all([
    prisma.subscription.findMany({
      where: { tenantId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      include: { tier: { select: { priceCents: true, interval: true } } },
    }),
    prisma.subscription.count({
      where: { tenantId, status: "CANCELED", updatedAt: { gte: d30 } },
    }),
    prisma.order.findMany({
      where: { tenantId, status: "PAID" },
      select: { amountCents: true, createdAt: true },
    }),
    prisma.membership.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.membership.count({
      where: { tenantId, status: "ACTIVE", joinedAt: { gte: d30 } },
    }),
    prisma.membership.findMany({
      where: { tenantId, joinedAt: { gte: monthsBack(5) } },
      select: { joinedAt: true },
    }),
    prisma.post.count({ where: { tenantId, createdAt: { gte: d30 } } }),
    prisma.post.count({
      where: { tenantId, createdAt: { gte: d60, lt: d30 } },
    }),
    prisma.comment.count({ where: { tenantId, createdAt: { gte: d30 } } }),
    prisma.comment.count({
      where: { tenantId, createdAt: { gte: d60, lt: d30 } },
    }),
    prisma.reaction.count({ where: { tenantId, createdAt: { gte: d30 } } }),
    prisma.reaction.count({
      where: { tenantId, createdAt: { gte: d60, lt: d30 } },
    }),
    prisma.course.findMany({
      where: { tenantId },
      select: {
        id: true,
        title: true,
        lessons: { select: { id: true } },
      },
    }),
    prisma.newsletterCampaign.findMany({
      where: { tenantId, status: "SENT" },
      orderBy: { sentAt: "desc" },
      take: 5,
      include: { emailEvents: { select: { type: true } } },
    }),
  ]);

  // ---- MRR: monatliche Abos voll, jährliche anteilig.
  let mrrCents = 0;
  for (const s of activeSubs) {
    if (s.tier.interval === "MONTH") mrrCents += s.tier.priceCents;
    else if (s.tier.interval === "YEAR") mrrCents += Math.round(s.tier.priceCents / 12);
  }

  // ---- Churn (30 Tage): Kündigungen / (aktive + Kündigungen).
  const churnBase = activeSubs.length + canceled30d;
  const churnRate30d = churnBase === 0 ? 0 : Math.round((canceled30d / churnBase) * 1000) / 10;

  // ---- Umsatz.
  const revenueTotalCents = paidOrders.reduce((sum, o) => sum + o.amountCents, 0);
  const orders30dRows = paidOrders.filter((o) => o.createdAt >= d30);
  const revenue30dCents = orders30dRows.reduce((sum, o) => sum + o.amountCents, 0);

  // ---- Mitgliederwachstum: Beitritte pro Monat, letzte 6 Monate.
  const memberGrowth: MonthBucket[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = monthsBack(i);
    const end = monthsBack(i - 1);
    memberGrowth.push({
      label: monthFmt.format(start),
      value: joins6m.filter((m) => m.joinedAt >= start && m.joinedAt < end).length,
    });
  }

  // ---- Kurs-Abschlussraten.
  const courseStats: CourseStat[] = await Promise.all(
    courses.map(async (c) => {
      const lessonIds = c.lessons.map((l) => l.id);
      if (lessonIds.length === 0) {
        return { id: c.id, title: c.title, lessonCount: 0, students: 0, completionRate: 0 };
      }
      const progress = await prisma.lessonProgress.groupBy({
        by: ["userId"],
        where: { tenantId, lessonId: { in: lessonIds } },
        _count: { _all: true },
      });
      const students = progress.length;
      const completed = progress.reduce((sum, p) => sum + p._count._all, 0);
      const completionRate =
        students === 0
          ? 0
          : Math.round((completed / (students * lessonIds.length)) * 100);
      return {
        id: c.id,
        title: c.title,
        lessonCount: lessonIds.length,
        students,
        completionRate,
      };
    }),
  );

  // ---- Newsletter-Performance.
  const campaigns: CampaignStat[] = campaignsRaw.map((c) => {
    const count = (t: string) => c.emailEvents.filter((e) => e.type === t).length;
    return {
      id: c.id,
      subject: c.subject,
      sentAt: c.sentAt?.toISOString() ?? null,
      recipients: c.recipientCount,
      delivered: count("DELIVERED") || count("SENT"),
      opened: count("OPENED"),
      clicked: count("CLICKED"),
    };
  });

  return {
    mrrCents,
    activeSubscriptions: activeSubs.length,
    revenue30dCents,
    revenueTotalCents,
    orders30d: orders30dRows.length,
    churnRate30d,
    activeMembers,
    newMembers30d,
    memberGrowth,
    posts30d,
    postsPrev30d: postsPrev,
    comments30d,
    commentsPrev30d: commentsPrev,
    reactions30d,
    reactionsPrev30d: reactionsPrev,
    courses: courseStats,
    campaigns,
  };
}
