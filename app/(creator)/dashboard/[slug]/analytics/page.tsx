import { requireTenantAdmin } from "@/lib/guards";
import { featureGate } from "@/components/dashboard/feature-gate";
import { getAnalyticsSummary } from "@/lib/analytics";
import { getTranslations, getLocale } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { PLATFORM_CURRENCY } from "@/lib/currency";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.analytics");
  return { title: t("metaTitle") };
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: IconName;
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
            {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Icon name={icon} size={18} />
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

function Trend({
  now,
  prev,
  label,
}: {
  now: number;
  prev: number;
  label: (value: string) => string;
}) {
  if (prev === 0 && now === 0) return <span className="text-slate-500">—</span>;
  const diff = prev === 0 ? 100 : Math.round(((now - prev) / prev) * 100);
  const up = diff >= 0;
  return (
    <span className={up ? "text-emerald-700" : "text-red-700"}>
      {label(`${up ? "+" : ""}${diff}`)}
    </span>
  );
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);
  // Paywall: the queries below never run for a package without this feature.
  const locked = await featureGate(tenant.id, slug, "analytics");
  if (locked) return locked;
  const a = await getAnalyticsSummary(tenant.id);
  const t = await getTranslations("dashboard.analytics");
  const locale = await getLocale();
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: PLATFORM_CURRENCY.toUpperCase() });
  const nf = new Intl.NumberFormat(locale);
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const money = (cents: number) => eur.format(cents / 100);

  const growthMax = Math.max(1, ...a.memberGrowth.map((b) => b.value));
  const growthTotal = a.memberGrowth.reduce((sum, b) => sum + b.value, 0);
  const growthCurrent = a.memberGrowth[a.memberGrowth.length - 1]?.value ?? 0;
  const monthShort = new Intl.DateTimeFormat(locale, { month: "short" });
  const monthLong = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });

  return (
    <div>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {/* ------------------------------------------------ Monetarisierung */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("mrr")}
          value={money(a.mrrCents)}
          hint={t("mrrHint", { count: a.activeSubscriptions })}
          icon="creditCard"
        />
        <StatCard
          label={t("revenue30d")}
          value={money(a.revenue30dCents)}
          hint={t("revenue30dHint", { count: a.orders30d, total: money(a.revenueTotalCents) })}
          icon="payouts"
        />
        <StatCard
          label={t("churn")}
          value={t("churnValue", { value: a.churnRate30d.toLocaleString(locale) })}
          hint={t("churnHint")}
          icon="trendingUp"
        />
        <StatCard
          label={t("activeMembers")}
          value={nf.format(a.activeMembers)}
          hint={t("activeMembersHint", { count: a.newMembers30d })}
          icon="members"
        />
      </div>

      {/* ------------------------------------------------ Wachstum + Engagement */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 id="growth-heading" className="text-sm font-bold text-slate-900">
              {t("newMembers6m")}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {t("growthSummary", { total: growthTotal, current: growthCurrent })}
            </p>
            {growthTotal === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                {t("growthEmpty")}
              </p>
            ) : (
              <figure aria-labelledby="growth-heading" className="mt-4">
                {/* Die Balken sind nur das Bild; dieselben Zahlen stehen in der
                    Tabelle darunter (fuer Screenreader). Jede Saeule hat eine
                    feste Hoehe — ohne sie loeste sich die Prozenthoehe des
                    Balkens zu 0 px auf. Die Achse beginnt bei 0. */}
                <div aria-hidden className="flex gap-2 border-b border-slate-300">
                  {a.memberGrowth.map((b) => {
                    const pct = (b.value / growthMax) * 85;
                    return (
                      <div key={b.start} className="relative h-32 flex-1">
                        {b.value > 0 && (
                          <div
                            className="absolute inset-x-0 bottom-0 rounded-t-md bg-[var(--brand,#6d28d9)]"
                            style={{ height: `${pct}%` }}
                          />
                        )}
                        <span
                          className="absolute inset-x-0 text-center text-xs font-semibold tabular-nums text-slate-700"
                          style={{ bottom: `calc(${pct}% + 4px)` }}
                        >
                          {nf.format(b.value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div aria-hidden className="mt-1.5 flex gap-2">
                  {a.memberGrowth.map((b) => (
                    <span key={b.start} className="flex-1 truncate text-center text-xs text-slate-500">
                      {monthShort.format(new Date(b.start))}
                    </span>
                  ))}
                </div>
                <table className="sr-only">
                  <caption>{t("newMembers6m")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("colMonth")}</th>
                      <th scope="col">{t("colNewMembers")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.memberGrowth.map((b) => (
                      <tr key={b.start}>
                        <th scope="row">{monthLong.format(new Date(b.start))}</th>
                        <td>{nf.format(b.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </figure>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-slate-900">{t("engagement")}</h2>
            <ul className="mt-4 space-y-3">
              {[
                { label: t("engPosts"), now: a.posts30d, prev: a.postsPrev30d },
                { label: t("engComments"), now: a.comments30d, prev: a.commentsPrev30d },
                { label: t("engReactions"), now: a.reactions30d, prev: a.reactionsPrev30d },
              ].map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
                >
                  <span className="text-sm font-medium text-slate-700">{row.label}</span>
                  <span className="flex items-baseline gap-3">
                    <span className="text-lg font-bold text-slate-900">
                      {nf.format(row.now)}
                    </span>
                    <span className="text-xs">
                      <Trend now={row.now} prev={row.prev} label={(value) => t("trend", { value })} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* ------------------------------------------------ Kurse */}
      {a.courses.length > 0 && (
        <Card className="mt-6">
          <CardBody>
            <h2 className="text-sm font-bold text-slate-900">{t("courseCompletion")}</h2>
            <ul className="mt-4 space-y-3">
              {a.courses.map((c) => (
                <li key={c.id}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-slate-700">{c.title}</span>
                    <span className="text-xs text-slate-500">
                      {t("courseMeta", {
                        students: t("courseStudents", { count: c.students }),
                        lessons: t("courseLessons", { count: c.lessonCount }),
                        rate: c.completionRate,
                      })}
                    </span>
                  </div>
                  <div aria-hidden className="mt-1.5 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-[var(--brand,#6d28d9)]/80"
                      style={{ width: `${c.completionRate}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* ------------------------------------------------ Newsletter */}
      {a.campaigns.length > 0 && (
        <Card className="mt-6">
          <CardBody>
            <h2 className="text-sm font-bold text-slate-900">
              {t("newsletterPerf")}
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-4 font-medium">{t("colCampaign")}</th>
                    <th className="pb-2 pr-4 font-medium">{t("colSent")}</th>
                    <th className="pb-2 pr-4 font-medium">{t("colRecipients")}</th>
                    <th className="pb-2 pr-4 font-medium">{t("colOpens")}</th>
                    <th className="pb-2 font-medium">{t("colClicks")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {a.campaigns.map((c) => (
                    <tr key={c.id}>
                      <td className="max-w-64 truncate py-2.5 pr-4 font-medium text-slate-700">
                        {c.subject}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500">
                        {c.sentAt ? dateFmt.format(new Date(c.sentAt)) : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500">{nf.format(c.recipients)}</td>
                      <td className="py-2.5 pr-4 text-slate-500">
                        {nf.format(c.opened)}
                        {c.recipients > 0 && (
                          <span className="ml-1 text-xs text-slate-500">
                            ({Math.round((c.opened / c.recipients) * 100)}%)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-500">{nf.format(c.clicked)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
