import Link from "next/link";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { listLiveSessions } from "@/lib/live";
import { formatPrice, formatDateTime } from "@/lib/utils";
import { parseStorySettings } from "@/lib/space-settings";
import { groupStoriesByAuthor } from "@/lib/stories";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { LiveSessionCard } from "./live-session-card";
import { Avatar, EmptyState, Pill } from "@/components/ui/misc";
import { StoryViewer } from "./story-viewer";
import { PLATFORM_CURRENCY } from "@/lib/currency";

export interface PreviewSpace {
  id: string;
  slug: string;
  name: string;
  type: string;
  description: string | null;
  settings: unknown;
}

interface Props {
  slug: string;
  tenantId: string;
  space: PreviewSpace;
  locked: boolean;
  icon: IconName;
  typeLabel: string;
  locale: string;
}

/**
 * Renders a single space as its own home-page section (page builder → SPACE).
 * Locked or unsupported types fall back to a compact "spotlight" card; the
 * content types below get a real inline preview that links into the space.
 */
export async function SpaceSectionPreview(props: Props) {
  const { space, locked } = props;
  if (locked) return <SpotlightCard {...props} />;
  switch (space.type) {
    case "STORIES":
      return <StoriesPreview {...props} />;
    case "LIVE":
      return <LivePreview {...props} />;
    case "TIPS":
      return <TipsPreview {...props} />;
    case "CALENDAR":
      return <CalendarPreview {...props} />;
    case "BOOKING":
      return <BookingPreview {...props} />;
    default:
      return <SpotlightCard {...props} />;
  }
}

/** Section header: space name + "view all" link into the space. */
async function Header({ slug, space }: { slug: string; space: PreviewSpace }) {
  const t = await getTranslations("community.render.spotlight");
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="display-serif text-2xl text-[#161613]">{space.name}</h2>
      <Link
        href={`/c/${slug}/s/${space.slug}`}
        className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[color:var(--brand)] transition hover:gap-1.5"
      >
        {t("viewAll")}
        <Icon name="chevron" size={14} className="-rotate-90" />
      </Link>
    </div>
  );
}

function SpotlightCard({ slug, space, locked, icon, typeLabel }: Props) {
  const href = locked ? `/c/${slug}/join` : `/c/${slug}/s/${space.slug}`;
  return (
    <section>
      <Link
        href={href}
        className="group flex items-center gap-4 rounded-3xl border border-[#161613]/10 bg-white p-5 transition duration-300 hover:-translate-y-0.5 hover:border-[#161613]/30 hover:shadow-sm sm:gap-5 sm:p-6"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand)]">
          <Icon name={icon} size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#161613]/45">
            {typeLabel}
            {locked && <Icon name="lock" size={12} className="text-[#161613]/40" />}
          </span>
          <span className="display-serif mt-1 block truncate text-2xl text-[#161613] group-hover:text-[color:var(--brand)]">
            {space.name}
          </span>
          {space.description && (
            <span className="mt-1 block truncate text-sm text-[#161613]/55">{space.description}</span>
          )}
        </span>
        <Icon
          name="arrowRight"
          size={18}
          className="shrink-0 text-[#161613]/30 transition group-hover:translate-x-0.5 group-hover:text-[#161613]"
        />
      </Link>
    </section>
  );
}

async function StoriesPreview({ slug, tenantId, space }: Props) {
  const t = await getTranslations("community.render.stories");
  const now = new Date();
  const rows = await prisma.story.findMany({
    where: { tenantId, spaceId: space.id, publishAt: { lte: now }, expiresAt: { gt: now } },
    orderBy: { publishAt: "desc" },
    take: 60,
    include: { author: { select: { name: true, avatarUrl: true } } },
  });
  const groups = groupStoriesByAuthor(rows);
  return (
    <section>
      <Header slug={slug} space={space} />
      {groups.length === 0 ? (
        <EmptyState icon="sparkles" title={t("empty")} hint={t("emptyHint")} />
      ) : (
        <StoryViewer
          variant="cards"
          autoplaySeconds={parseStorySettings(space.settings).autoplaySeconds}
          groups={groups}
        />
      )}
    </section>
  );
}

async function LivePreview({ slug, tenantId, space, locale }: Props) {
  const tSpace = await getTranslations("community.render.space");
  const sessions = (await listLiveSessions(tenantId, space.id))
    .filter((s) => s.status !== "ENDED")
    .slice(0, 4);
  return (
    <section>
      <Header slug={slug} space={space} />
      {sessions.length === 0 ? (
        <EmptyState icon="videos" title={tSpace("liveNone")} hint={tSpace("liveNoneHint")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sessions.map((s) => (
            <LiveSessionCard
              key={s.id}
              href={`/c/${slug}/s/${space.slug}?open=${s.id}`}
              title={s.title}
              status={s.status}
              statusLabel={tSpace(`liveStatus.${s.status}`)}
              streamUrl={s.streamUrl}
              startsAtLabel={s.startsAt ? formatDateTime(s.startsAt, locale) : null}
              startsAtIso={s.startsAt ? new Date(s.startsAt).toISOString() : null}
            />
          ))}
        </div>
      )}
    </section>
  );
}

async function TipsPreview({ slug, tenantId, space, locale }: Props) {
  const t = await getTranslations("community.render.tips");
  const settings =
    space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
      ? (space.settings as Record<string, unknown>)
      : {};
  const goalCents = Number(settings.tipGoalCents) || 0;
  const [agg, tips] = await Promise.all([
    prisma.tip.aggregate({
      where: { tenantId, spaceId: space.id, status: "PAID" },
      _sum: { amountCents: true },
    }),
    prisma.tip.findMany({
      where: { tenantId, spaceId: space.id, status: "PAID", isPublic: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { name: true, avatarUrl: true } } },
    }),
  ]);
  const raised = agg._sum.amountCents ?? 0;
  const pct = goalCents > 0 ? Math.min(100, Math.round((raised / goalCents) * 100)) : 0;
  return (
    <section>
      <Header slug={slug} space={space} />
      <div className="rounded-2xl border border-[#161613]/10 bg-white p-5">
        {goalCents > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-[#161613]">{formatPrice(raised, PLATFORM_CURRENCY, locale)}</span>
              <span className="text-[#161613]/50">{t("goal", { goal: formatPrice(goalCents, PLATFORM_CURRENCY, locale) })}</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#161613]/10">
              <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        {tips.length === 0 ? (
          <p className="py-4 text-center text-sm text-[#161613]/50">{t("empty")}</p>
        ) : (
          <div className="space-y-3">
            {tips.map((tp) => (
              <div key={tp.id} className="flex items-center gap-3">
                <Avatar name={tp.user.name} src={tp.user.avatarUrl} size={32} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-semibold text-[#161613]">{tp.user.name}</span>
                  {tp.message ? <span className="text-[#161613]/60"> — {tp.message}</span> : null}
                </span>
                <span className="shrink-0 text-sm font-semibold text-[color:var(--brand)]">
                  {formatPrice(tp.amountCents, tp.currency, locale)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

async function CalendarPreview({ slug, tenantId, space, locale }: Props) {
  const t = await getTranslations("community.render.calendar");
  const now = new Date();
  const [events, lives, scheduled] = await Promise.all([
    prisma.event.findMany({
      where: { tenantId, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 6,
      select: { id: true, title: true, startsAt: true, space: { select: { slug: true } } },
    }),
    prisma.liveSession.findMany({
      where: { tenantId, startsAt: { gte: now }, status: { not: "ENDED" } },
      orderBy: { startsAt: "asc" },
      take: 6,
      select: { id: true, title: true, startsAt: true, space: { select: { slug: true } } },
    }),
    prisma.post.findMany({
      where: { tenantId, scheduledAt: { not: null, gte: now } },
      orderBy: { scheduledAt: "asc" },
      take: 6,
      select: { id: true, title: true, scheduledAt: true, space: { select: { slug: true } } },
    }),
  ]);
  type Entry = { id: string; title: string; when: Date; kind: "event" | "live" | "post"; href: string | null };
  const entries: Entry[] = [
    ...events.map((e) => ({ id: `e-${e.id}`, title: e.title, when: e.startsAt, kind: "event" as const, href: e.space ? `/c/${slug}/s/${e.space.slug}` : null })),
    ...lives.map((l) => ({ id: `l-${l.id}`, title: l.title, when: l.startsAt as Date, kind: "live" as const, href: l.space ? `/c/${slug}/s/${l.space.slug}?open=${l.id}` : null })),
    ...scheduled.map((p) => ({ id: `p-${p.id}`, title: p.title || t("untitledPost"), when: p.scheduledAt as Date, kind: "post" as const, href: p.space ? `/c/${slug}/s/${p.space.slug}` : null })),
  ]
    .filter((x) => x.when)
    .sort((a, b) => a.when.getTime() - b.when.getTime())
    .slice(0, 5);

  const kindCls: Record<string, string> = {
    event: "bg-blue-100 text-blue-700",
    live: "bg-red-100 text-red-700",
    post: "bg-slate-100 text-slate-600",
  };
  return (
    <section>
      <Header slug={slug} space={space} />
      {entries.length === 0 ? (
        <EmptyState icon="events" title={t("empty")} hint={t("emptyHint")} />
      ) : (
        <div className="space-y-2.5">
          {entries.map((x) => {
            const inner = (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#161613]/10 bg-white p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[#161613]">{x.title}</p>
                  <p className="mt-1 text-sm text-[#161613]/55">{formatDateTime(x.when, locale)}</p>
                </div>
                <Pill className={kindCls[x.kind]}>{t(`kind.${x.kind}`)}</Pill>
              </div>
            );
            return x.href ? (
              <Link key={x.id} href={x.href} className="block transition hover:opacity-90">
                {inner}
              </Link>
            ) : (
              <div key={x.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}

async function BookingPreview({ slug, tenantId, space, locale }: Props) {
  const t = await getTranslations("community.render.booking");
  const now = new Date();
  const slots = await prisma.bookingSlot.findMany({
    where: { tenantId, spaceId: space.id, startsAt: { gte: now } },
    orderBy: { startsAt: "asc" },
    take: 4,
    include: { _count: { select: { reservations: true } } },
  });
  return (
    <section>
      <Header slug={slug} space={space} />
      {slots.length === 0 ? (
        <EmptyState icon="clock" title={t("empty")} hint={t("emptyHint")} />
      ) : (
        <div className="space-y-2.5">
          {slots.map((s) => {
            const full = s._count.reservations >= s.capacity;
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#161613]/10 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[#161613]">{s.title}</p>
                  <p className="mt-1 text-xs text-[#161613]/55">
                    {formatDateTime(s.startsAt, locale)} · {t("minutes", { count: s.durationMin })}
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <Pill className={full ? "bg-[#161613]/10 text-[#161613]/50" : "bg-[var(--brand-soft)] text-[color:var(--brand)]"}>
                    {full ? (
                      t("full")
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="members" size={12} />
                        {s._count.reservations}/{s.capacity}
                      </span>
                    )}
                  </Pill>
                  <span className="text-sm font-semibold text-[#161613]">
                    {s.priceCents === 0 ? t("free") : formatPrice(s.priceCents, s.currency, locale)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
