import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getCommunityContext } from "@/lib/guards";
import { canAccess } from "@/lib/entitlements";
import { formatDateTime } from "@/lib/utils";
import { EmptyState } from "@/components/ui/misc";
import { LiveSessionCard } from "@/components/community/live-session-card";

/**
 * Live-Übersicht der Community — Ziel des Menüpunkts "Live".
 *
 * Sammelt die Streams aus allen Live-Spaces an einem Ort und trennt sie in
 * "läuft gerade", "geplant" und "Wiederholungen". Wer live sucht, sucht nach
 * dem Zeitpunkt, nicht nach dem Space, in dem der Stream zufällig liegt.
 */
export default async function CommunityLive({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, ctx } = community;
  const t = await getTranslations("community.live");
  const tSpace = await getTranslations("community.render.space");
  const locale = await getLocale();

  const spaces = await prisma.space.findMany({
    where: { tenantId: tenant.id, type: "LIVE", isArchived: false },
    select: {
      id: true,
      slug: true,
      visibility: true,
      requiredEntitlementKey: true,
    },
  });
  const visible = spaces.filter((s) => canAccess(s, ctx));
  const sessions = visible.length
    ? await prisma.liveSession.findMany({
        where: { tenantId: tenant.id, spaceId: { in: visible.map((s) => s.id) } },
        orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
        take: 60,
        include: { space: { select: { slug: true } } },
      })
    : [];

  const groups = [
    { key: "now", list: sessions.filter((s) => s.status === "LIVE") },
    { key: "upcoming", list: sessions.filter((s) => s.status === "SCHEDULED") },
    { key: "past", list: sessions.filter((s) => s.status === "ENDED") },
  ].filter((g) => g.list.length > 0);

  return (
    <div>
      <h1 className="display-serif text-3xl text-[#161613]">{t("title")}</h1>
      <p className="mt-1 text-[#161613]/55">{t("subtitle", { name: tenant.name })}</p>

      {groups.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon="broadcast" title={t("emptyTitle")} hint={t("emptyHint")} />
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-[#161613]/45">
                {g.key === "now" && (
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                )}
                {t(`group.${g.key}`)}
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.list.map((s) => (
                  <LiveSessionCard
                    key={s.id}
                    href={`/c/${slug}/s/${s.space?.slug ?? ""}?open=${s.id}`}
                    title={s.title}
                    status={s.status}
                    statusLabel={tSpace(`liveStatus.${s.status}`)}
                    streamUrl={s.streamUrl}
                    ownStreamLabel={s.source === "AERA" ? tSpace("liveOwnStream") : null}
                    startsAtLabel={s.startsAt ? formatDateTime(s.startsAt, locale) : null}
                    startsAtIso={s.startsAt ? s.startsAt.toISOString() : null}
                    watchNowLabel={s.status === "LIVE" ? tSpace("liveWatchNow") : undefined}
                    watchReplayLabel={s.status === "ENDED" ? tSpace("liveWatchReplay") : undefined}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
