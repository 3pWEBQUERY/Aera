import { redirect } from "next/navigation";
import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import { getPollDraftsForPosts } from "@/lib/polls";
import { getPostSettingsForPosts } from "@/lib/post-settings";
import {
  SpaceContentManager,
  type PostItem,
} from "@/components/dashboard/space-content-manager";
import {
  ForumModerationManager,
  type ModThread,
} from "@/components/dashboard/forum-moderation-manager";
import {
  GalleryManager,
  type GalleryPackage,
} from "@/components/dashboard/gallery-manager";
import {
  NewsletterManager,
  type CampaignRowData,
  type SegmentData,
} from "@/components/dashboard/newsletter-manager";
import {
  KnowledgeManager,
  type KArticle,
} from "@/components/dashboard/knowledge-manager";
import {
  BlogManager,
  type BlogAdminPost,
} from "@/components/dashboard/blog-manager";
import {
  CoursesManager,
  type CourseRowData,
} from "@/components/dashboard/courses-manager";
import {
  EventsManager,
  type EventRowData,
} from "@/components/dashboard/events-manager";
import {
  CalendarManager,
  type AggregatedEntry,
} from "@/components/dashboard/calendar-manager";
import { AnnouncementsManager } from "@/components/dashboard/announcements-manager";
import { LinksManager } from "@/components/dashboard/links-manager";
import { AdsManager } from "@/components/dashboard/ads-manager";
import { LiveManager, type LiveSessionRow } from "@/components/dashboard/live-manager";
import { RequestsManager, type RequestRow } from "@/components/dashboard/requests-manager";
import { BookingManager, type BookingSlotRow } from "@/components/dashboard/booking-manager";
import { StoriesManager, type StoryRow } from "@/components/dashboard/stories-manager";
import { TipsManager, type TipRow } from "@/components/dashboard/tips-manager";
import { ChatSpaceManager } from "@/components/dashboard/chat-space-manager";
import { chatStats, recentMessagesForAdmin } from "@/lib/chat";
import { parseChatSettings } from "@/lib/space-settings";
import {
  parseKnowledgeSettings,
  parseBlogSettings,
  parseAnnouncements,
  parseSpaceLinks,
  parseSpaceAds,
  parseStorySettings,
  isAnnouncementsOnly,
} from "@/lib/space-settings";
import { excerpt } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { PLATFORM_CURRENCY } from "@/lib/currency";

const POST_TYPES = ["FEED", "VIDEOS", "PODCAST"];

export default async function SpaceContentPage({
  params,
}: {
  params: Promise<{ slug: string; spaceSlug: string }>;
}) {
  const { slug, spaceSlug } = await params;
  const { tenant, user } = await requireTenantAdmin(slug);
  const space = await prisma.space.findFirst({
    where: { tenantId: tenant.id, slug: spaceSlug },
  });
  if (!space) redirect(`/dashboard/${slug}/spaces`);

  // ----- Chat -----
  if (space.type === "CHAT") {
    const tVisibility = await getTranslations("dashboard.visibility");
    const [stats, recent] = await Promise.all([
      chatStats(tenant.id, space.id),
      recentMessagesForAdmin(tenant.id, space.id, 40),
    ]);
    const visLabel =
      space.visibility === "PUBLIC"
        ? tVisibility("PUBLIC.label")
        : space.visibility === "PAID"
          ? tVisibility("PAID.label")
          : tVisibility("MEMBERS.label");
    return (
      <ChatSpaceManager
        slug={slug}
        spaceId={space.id}
        spaceSlug={space.slug}
        spaceName={space.name}
        visibilityLabel={visLabel}
        settings={parseChatSettings(space.settings)}
        stats={stats}
        messages={recent}
      />
    );
  }

  // ----- Forum moderation -----
  if (space.type === "FORUM") {
    const threadRows = await prisma.post.findMany({
      where: { tenantId: tenant.id, spaceId: space.id },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        author: { select: { name: true } },
        _count: { select: { comments: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { name: true } } },
        },
      },
    });
    const ids = threadRows.map((t) => t.id);
    const pollDrafts = await getPollDraftsForPosts(tenant.id, ids);
    const postSettings = await getPostSettingsForPosts(tenant.id, ids);
    const groups = ids.length
      ? await prisma.reaction.groupBy({
          by: ["postId", "type"],
          where: { tenantId: tenant.id, postId: { in: ids }, type: { in: ["UP", "DOWN"] } },
          _count: true,
        })
      : [];
    const scoreMap: Record<string, number> = {};
    for (const g of groups) {
      if (!g.postId) continue;
      scoreMap[g.postId] = (scoreMap[g.postId] ?? 0) + (g.type === "UP" ? 1 : -1) * (g._count as number);
    }
    const threads: ModThread[] = threadRows.map((t) => ({
      id: t.id,
      title: t.title,
      body: t.body,
      bodyHtml: t.bodyHtml,
      pollQuestion: pollDrafts.get(t.id)?.question ?? null,
      pollOptions: pollDrafts.get(t.id)?.options ?? [],
      pollMultiple: pollDrafts.get(t.id)?.multiple ?? false,
      customSlug: postSettings.get(t.id)?.customSlug ?? null,
      customHtml: postSettings.get(t.id)?.customHtml ?? null,
      hideComments: postSettings.get(t.id)?.hideComments ?? false,
      closeComments: postSettings.get(t.id)?.closeComments ?? false,
      hideLikes: postSettings.get(t.id)?.hideLikes ?? false,
      hideMetaInfo: postSettings.get(t.id)?.hideMetaInfo ?? false,
      hideFromFeatured: postSettings.get(t.id)?.hideFromFeatured ?? false,
      disableTruncation: postSettings.get(t.id)?.disableTruncation ?? false,
      authorName: t.author.name,
      createdAt: t.createdAt,
      isPinned: t.isPinned,
      score: scoreMap[t.id] ?? 0,
      commentCount: t._count.comments,
      comments: t.comments.map((c) => ({
        id: c.id,
        body: c.body,
        authorName: c.author.name,
        createdAt: c.createdAt,
        parentId: c.parentId,
      })),
    }));
    return (
      <ForumModerationManager
        slug={slug}
        space={{ id: space.id, slug: space.slug, name: space.name }}
        threads={threads}
        creator={{ name: user.name, email: user.email }}
      />
    );
  }

  // ----- Gallery: media-package folder system -----
  if (space.type === "GALLERY") {
    const rows = await prisma.mediaPackage.findMany({
      where: { tenantId: tenant.id, spaceId: space.id },
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    const packages: GalleryPackage[] = rows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      coverUrl: p.coverUrl,
      priceCents: p.priceCents,
      isPublished: p.isPublished,
      availableUntil: p.availableUntil ? p.availableUntil.toISOString() : null,
      items: p.items.map((i) => ({
        id: i.id,
        type: i.type === "VIDEO" ? "VIDEO" : "IMAGE",
        url: i.url,
        caption: i.caption,
      })),
    }));
    return (
      <GalleryManager
        slug={slug}
        space={{ id: space.id, slug: space.slug, name: space.name }}
        packages={packages}
      />
    );
  }

  // ----- Newsletter: manage campaigns inside the space -----
  if (space.type === "NEWSLETTER") {
    const [rows, segs, tiers] = await Promise.all([
      prisma.newsletterCampaign.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
        include: { segment: { select: { name: true } } },
      }),
      prisma.segment.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true },
      }),
      prisma.membershipTier.findMany({
        where: { tenantId: tenant.id },
        select: { slug: true, name: true },
      }),
    ]);
    const campaigns: CampaignRowData[] = rows.map((c) => ({
      id: c.id,
      subject: c.subject,
      body: c.body,
      status: c.status,
      segmentId: c.segmentId,
      segmentName: c.segment?.name ?? null,
      recipientCount: c.recipientCount,
      sentAt: c.sentAt,
      scheduledAt: c.scheduledAt,
    }));
    const segments: SegmentData[] = segs;
    return <NewsletterManager slug={slug} campaigns={campaigns} segments={segments} tiers={tiers} />;
  }

  // ----- Blog: manage posts (rich editor) + display settings -----
  if (space.type === "BLOG") {
    const rows = await prisma.post.findMany({
      where: { tenantId: tenant.id, spaceId: space.id },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { author: { select: { name: true } } },
    });
    const posts: BlogAdminPost[] = rows.map((p) => ({
      id: p.id,
      title: p.title || excerpt(p.body, 60) || "Ohne Titel",
      excerpt: excerpt(p.body, 160),
      coverUrl: p.imageUrl,
      bodyHtml: p.bodyHtml,
      createdAt: p.createdAt,
      authorName: p.author.name,
    }));
    return (
      <BlogManager
        slug={slug}
        space={{ id: space.id, slug: space.slug, name: space.name }}
        posts={posts}
        settings={parseBlogSettings(space.settings)}
      />
    );
  }

  // ----- Course: manage courses & lessons inside the space -----
  if (space.type === "COURSE") {
    const rows = await prisma.course.findMany({
      where: { tenantId: tenant.id, spaceId: space.id },
      orderBy: { createdAt: "desc" },
      include: { lessons: { orderBy: { sortOrder: "asc" } } },
    });
    const courses: CourseRowData[] = rows.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      coverUrl: c.coverUrl,
      isPublished: c.isPublished,
      format: c.format,
      videoUrl: c.videoUrl,
      streamUrl: c.streamUrl,
      location: c.location,
      address: c.address,
      startsAt: c.startsAt,
      capacity: c.capacity,
      lessons: c.lessons.map((l) => ({ id: l.id, title: l.title, content: l.content, videoUrl: l.videoUrl })),
    }));
    return <CoursesManager slug={slug} courses={courses} spaceId={space.id} />;
  }

  // ----- Events: manage events inside the space -----
  if (space.type === "EVENTS") {
    const rows = await prisma.event.findMany({
      where: { tenantId: tenant.id, spaceId: space.id },
      orderBy: { startsAt: "asc" },
      include: { _count: { select: { rsvps: true } } },
    });
    const events: EventRowData[] = rows.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      startsAt: e.startsAt,
      location: e.location,
      isOnline: e.isOnline,
      meetingUrl: e.meetingUrl,
      coverUrl: e.coverUrl,
      capacity: e.capacity,
      rsvpCount: e._count.rsvps,
    }));
    return <EventsManager slug={slug} events={events} spaceId={space.id} />;
  }

  // ----- Knowledge base: articles + display settings -----
  if (space.type === "KNOWLEDGE") {
    const rows = await prisma.knowledgeArticle.findMany({
      where: { tenantId: tenant.id, spaceId: space.id },
      orderBy: { createdAt: "desc" },
    });
    const articles: KArticle[] = rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      createdAt: a.createdAt,
    }));
    return (
      <KnowledgeManager
        slug={slug}
        space={{ id: space.id, slug: space.slug, name: space.name }}
        articles={articles}
        settings={parseKnowledgeSettings(space.settings)}
      />
    );
  }

  // ----- Link-Hub: curated links (settings-based) -----
  if (space.type === "LINKS") {
    const links = parseSpaceLinks(space.settings).map((l) => ({
      id: l.id,
      title: l.title,
      url: l.url,
      description: l.description,
    }));
    return (
      <LinksManager
        slug={slug}
        space={{ id: space.id, slug: space.slug, name: space.name }}
        links={links}
      />
    );
  }

  // ----- Live: scheduled/live sessions -----
  if (space.type === "LIVE") {
    const [rows, tierRows] = await Promise.all([
      prisma.liveSession.findMany({
        where: { tenantId: tenant.id, spaceId: space.id },
        orderBy: [{ status: "asc" }, { startsAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.membershipTier.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }],
        select: { id: true, name: true, entitlementKey: true },
      }),
    ]);
    const sessions: LiveSessionRow[] = rows.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      streamUrl: s.streamUrl,
      replayUrl: s.replayUrl,
      requiredEntitlementKey: s.requiredEntitlementKey,
      startsAt: s.startsAt ? s.startsAt.toISOString() : null,
    }));
    return (
      <LiveManager
        slug={slug}
        space={{ id: space.id, slug: space.slug, name: space.name }}
        sessions={sessions}
        tiers={tierRows.map((tr) => ({ name: tr.name, entitlementKey: tr.entitlementKey }))}
      />
    );
  }

  // ----- Requests: member wishes / custom requests -----
  if (space.type === "REQUESTS") {
    const rows = await prisma.memberRequest.findMany({
      where: { tenantId: tenant.id, spaceId: space.id },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { requester: { select: { name: true, avatarUrl: true } } },
    });
    const requests: RequestRow[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      status: r.status,
      priceCents: r.priceCents,
      staffNote: r.staffNote,
      requesterName: r.requester.name,
      requesterAvatar: r.requester.avatarUrl,
      score: r.score,
      createdAt: r.createdAt.toISOString(),
    }));
    return (
      <RequestsManager
        slug={slug}
        space={{ id: space.id, slug: space.slug, name: space.name }}
        requests={requests}
      />
    );
  }

  // ----- Booking: 1:1 slots -----
  if (space.type === "BOOKING") {
    const rows = await prisma.bookingSlot.findMany({
      where: { tenantId: tenant.id, spaceId: space.id },
      orderBy: { startsAt: "asc" },
      take: 200,
      include: { _count: { select: { reservations: true } } },
    });
    const bslots: BookingSlotRow[] = rows.map((s) => ({
      id: s.id,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      durationMin: s.durationMin,
      priceCents: s.priceCents,
      capacity: s.capacity,
      reservedCount: s._count.reservations,
    }));
    return (
      <BookingManager
        slug={slug}
        space={{ id: space.id, slug: space.slug, name: space.name }}
        slots={bslots}
      />
    );
  }

  // ----- Stories (active / scheduled / archived — all time-derived) -----
  if (space.type === "STORIES") {
    const nowS = new Date();
    const base = { tenantId: tenant.id, spaceId: space.id } as const;
    const [activeRows, scheduledRows, archivedRows] = await Promise.all([
      prisma.story.findMany({
        where: { ...base, publishAt: { lte: nowS }, expiresAt: { gt: nowS } },
        orderBy: { publishAt: "desc" },
        take: 100,
      }),
      prisma.story.findMany({
        where: { ...base, publishAt: { gt: nowS } },
        orderBy: { publishAt: "asc" },
        take: 100,
      }),
      prisma.story.findMany({
        where: { ...base, expiresAt: { lte: nowS } },
        orderBy: { expiresAt: "desc" },
        take: 60,
      }),
    ]);
    const toRow = (s: (typeof activeRows)[number]): StoryRow => ({
      id: s.id,
      imageUrl: s.imageUrl,
      videoUrl: s.videoUrl,
      caption: s.caption,
      publishAt: s.publishAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    });
    return (
      <StoriesManager
        slug={slug}
        space={{ id: space.id, slug: space.slug, name: space.name }}
        active={activeRows.map(toRow)}
        scheduled={scheduledRows.map(toRow)}
        archived={archivedRows.map(toRow)}
        settings={parseStorySettings(space.settings)}
      />
    );
  }

  // ----- Tips wall -----
  if (space.type === "TIPS") {
    const settingsObj =
      space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
        ? (space.settings as Record<string, unknown>)
        : {};
    const goalCents = Number(settingsObj.tipGoalCents) || 0;
    const [rows, agg] = await Promise.all([
      prisma.tip.findMany({
        where: { tenantId: tenant.id, spaceId: space.id, status: "PAID" },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { user: { select: { name: true } } },
      }),
      prisma.tip.aggregate({
        where: { tenantId: tenant.id, spaceId: space.id, status: "PAID" },
        _sum: { amountCents: true },
      }),
    ]);
    const tips: TipRow[] = rows.map((tp) => ({
      id: tp.id,
      userName: tp.user.name,
      amountCents: tp.amountCents,
      currency: tp.currency,
      message: tp.message,
      createdAt: tp.createdAt.toISOString(),
    }));
    return (
      <TipsManager
        slug={slug}
        space={{ id: space.id, slug: space.slug, name: space.name }}
        tips={tips}
        totalCents={agg._sum.amountCents ?? 0}
        goalCents={goalCents}
        currency={PLATFORM_CURRENCY}
      />
    );
  }

  // ----- Calendar: own entries (popover CRUD) + aggregation overview -----
  if (space.type === "CALENDAR") {
    const nowC = new Date();
    const [ownRows, events, lives, scheduled] = await Promise.all([
      prisma.event.findMany({
        where: { tenantId: tenant.id, spaceId: space.id },
        orderBy: { startsAt: "asc" },
        include: { _count: { select: { rsvps: true } } },
      }),
      prisma.event.findMany({
        where: { tenantId: tenant.id, spaceId: { not: space.id }, startsAt: { gte: nowC } },
        orderBy: { startsAt: "asc" },
        take: 50,
        select: { id: true, title: true, startsAt: true },
      }),
      prisma.liveSession.findMany({
        where: { tenantId: tenant.id, startsAt: { gte: nowC }, status: { not: "ENDED" } },
        orderBy: { startsAt: "asc" },
        take: 50,
        select: { id: true, title: true, startsAt: true },
      }),
      prisma.post.findMany({
        where: { tenantId: tenant.id, scheduledAt: { not: null, gte: nowC } },
        orderBy: { scheduledAt: "asc" },
        take: 50,
        select: { id: true, title: true, scheduledAt: true },
      }),
    ]);
    const own: EventRowData[] = ownRows.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      startsAt: e.startsAt,
      location: e.location,
      isOnline: e.isOnline,
      meetingUrl: e.meetingUrl,
      coverUrl: e.coverUrl,
      capacity: e.capacity,
      rsvpCount: e._count.rsvps,
    }));
    const aggregated: AggregatedEntry[] = [
      ...events.map((e) => ({ id: `e-${e.id}`, title: e.title, when: e.startsAt, kind: "event" as const })),
      ...lives
        .filter((l) => l.startsAt)
        .map((l) => ({ id: `l-${l.id}`, title: l.title, when: l.startsAt as Date, kind: "live" as const })),
      ...scheduled
        .filter((post) => post.scheduledAt)
        .map((post) => ({ id: `p-${post.id}`, title: post.title ?? "—", when: post.scheduledAt as Date, kind: "post" as const })),
    ].sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
    return (
      <CalendarManager
        slug={slug}
        spaceId={space.id}
        spaceName={space.name}
        description={space.description}
        own={own}
        aggregated={aggregated}
      />
    );
  }

  // ----- Werbung: creator-run ad banners (settings-based) -----
  if (space.type === "ADS") {
    const ads = parseSpaceAds(space.settings).map((a) => ({
      id: a.id,
      title: a.title,
      mediaUrl: a.mediaUrl,
      mediaType: a.mediaType,
      targetUrl: a.targetUrl,
      durationSec: a.durationSec,
      endsAt: a.endsAt,
      isPublished: a.isPublished,
    }));
    return (
      <AdsManager
        slug={slug}
        space={{ id: space.id, slug: space.slug, name: space.name }}
        ads={ads}
      />
    );
  }

  // Banner-only FEED space: the whole page is the announcement manager.
  if (space.type === "FEED" && isAnnouncementsOnly(space.settings)) {
    return (
      <AnnouncementsManager
        slug={slug}
        spaceId={space.id}
        spaceName={space.name}
        announcements={parseAnnouncements(space.settings)}
        announcementsOnly
        standalone
      />
    );
  }

  const isPostType = POST_TYPES.includes(space.type);

  const postRows = isPostType
    ? await prisma.post.findMany({
        where: { tenantId: tenant.id, spaceId: space.id },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: 200,
        include: {
          author: { select: { name: true } },
          _count: { select: { comments: true } },
        },
      })
    : [];

  const posts: PostItem[] = postRows.map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    imageUrl: p.imageUrl,
    videoUrl: p.videoUrl,
    authorName: p.author.name,
    createdAt: p.createdAt,
    commentCount: p._count.comments,
  }));

  return (
    <div>
      {/* Announcement banners are managed from FEED spaces ("Ankündigungen"). */}
      {space.type === "FEED" && (
        <AnnouncementsManager
          slug={slug}
          spaceId={space.id}
          spaceName={space.name}
          announcements={parseAnnouncements(space.settings)}
        />
      )}
      <SpaceContentManager
        slug={slug}
        space={{ id: space.id, slug: space.slug, name: space.name, type: space.type }}
        posts={posts}
        articles={[]}
      />
    </div>
  );
}
