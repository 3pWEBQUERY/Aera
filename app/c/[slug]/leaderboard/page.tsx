import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCommunityContext } from "@/lib/guards";
import { leaderboard } from "@/lib/gamification";
import { Card, CardBody } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";

// Medal accents for the top three ranks — restrained, palette-consistent.
const MEDAL = [
  { avatarRing: "ring-2 ring-amber-300", ped: "bg-amber-50 text-amber-600 ring-1 ring-amber-200", h: "h-20" },
  { avatarRing: "ring-2 ring-slate-300", ped: "bg-slate-100 text-slate-500 ring-1 ring-slate-200", h: "h-14" },
  { avatarRing: "ring-2 ring-orange-300", ped: "bg-orange-50 text-orange-700 ring-1 ring-orange-200", h: "h-10" },
] as const;

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const t = await getTranslations("community.leaderboard");

  // Full leaderboard is members-only (the home page shows a public top 5).
  if (community.ctx.membership?.status !== "ACTIVE" && !community.ctx.isStaff) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
          <Icon name="lock" size={24} />
        </span>
        <h1 className="text-xl font-bold text-slate-900">{t("lockedTitle")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("lockedText")}</p>
      </div>
    );
  }

  const board = await leaderboard(community.tenant.id, 50);
  const meId = community.user?.id;
  const nf = new Intl.NumberFormat(await getLocale());

  const showPodium = board.length >= 3;
  const podium = board.slice(0, 3);
  const listRows = showPodium ? board.slice(3) : board;

  return (
    <div className="mx-auto max-w-2xl">
      {/* -------------------------------------------------------------- Header */}
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
          <Icon name="trophy" size={22} />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-500">
            {board.length > 0
              ? t("ranking", { count: board.length })
              : t("emptyHint")}
          </p>
        </div>
      </div>

      {board.length === 0 ? (
        <Card>
          <CardBody className="py-14 text-center">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 ring-1 ring-slate-200">
              <Icon name="trophy" size={24} />
            </span>
            <p className="text-sm font-medium text-slate-800">
              {t("emptyTitle")}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {t("emptyText")}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* ------------------------------------------------------------ Podium */}
          {showPodium && (
            <Card className="overflow-hidden">
              <CardBody className="bg-gradient-to-b from-[var(--brand-soft)] to-transparent pt-8">
                <div className="grid grid-cols-3 items-end gap-3">
                  {[1, 0, 2].map((idx) => {
                    const row = podium[idx];
                    const m = MEDAL[idx];
                    const isMe = row.userId === meId;
                    return (
                      <div key={row.userId} className="flex flex-col items-center">
                        {idx === 0 && (
                          <Icon
                            name="crown"
                            size={22}
                            className="mb-1 text-amber-400"
                          />
                        )}
                        <div className={`rounded-2xl ${m.avatarRing}`}>
                          <Avatar
                            name={row.name}
                            src={row.avatarUrl}
                            size={idx === 0 ? 68 : 52}
                          />
                        </div>
                        <p
                          className={`mt-2 max-w-full truncate text-center text-sm font-semibold ${
                            isMe ? "text-[color:var(--brand)]" : "text-slate-800"
                          }`}
                        >
                          {row.name}
                        </p>
                        {row.levelName && (
                          <p className="max-w-full truncate text-center text-xs text-slate-400">
                            {row.levelName}
                          </p>
                        )}
                        <span className="mt-1.5 rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-xs font-semibold text-[color:var(--brand)]">
                          {nf.format(row.points)} {t("pts")}
                        </span>
                        <div
                          className={`mt-3 flex ${m.h} w-full items-start justify-center rounded-t-xl pt-2 text-lg font-bold ${m.ped}`}
                        >
                          {idx + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          )}

          {/* -------------------------------------------------------- Ranked list */}
          {listRows.length > 0 && (
            <Card>
              <CardBody className="p-0">
                <ol className="divide-y divide-slate-100">
                  {listRows.map((row, i) => {
                    const rank = showPodium ? i + 4 : i + 1;
                    const medal = !showPodium && rank <= 3 ? MEDAL[rank - 1] : null;
                    const isMe = row.userId === meId;
                    return (
                      <li
                        key={row.userId}
                        className={`flex items-center gap-4 px-5 py-3 transition-colors ${
                          isMe ? "bg-[var(--brand-soft)]" : ""
                        }`}
                      >
                        <span
                          className={`w-6 text-center text-sm font-bold ${
                            medal ? "text-amber-500" : "text-slate-400"
                          }`}
                        >
                          {rank}
                        </span>
                        <Avatar name={row.name} src={row.avatarUrl} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-800">
                            <span className="truncate">{row.name}</span>
                            {isMe && (
                              <span className="shrink-0 rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                {t("youBadge")}
                              </span>
                            )}
                          </p>
                          {row.levelName && (
                            <p className="truncate text-xs text-slate-400">
                              {row.levelName}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 font-bold text-[color:var(--brand)]">
                          {nf.format(row.points)}
                          <span className="ml-1 text-xs font-medium text-slate-400">
                            {t("pts")}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
