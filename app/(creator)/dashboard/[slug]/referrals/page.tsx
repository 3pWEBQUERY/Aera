import { requireTenantAdmin } from "@/lib/guards";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { ReferralSettingsForm } from "@/components/dashboard/referral-settings";
import { PLATFORM_CURRENCY } from "@/lib/currency";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.referrals");
  return { title: t("metaTitle") };
}

export default async function ReferralsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);
  const t = await getTranslations("dashboard.referrals");
  const locale = await getLocale();
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: PLATFORM_CURRENCY.toUpperCase() });
  const nf = new Intl.NumberFormat(locale);
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  const conversions = await prisma.referralConversion.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
  });
  const activeConversions = conversions.filter((conversion) => !conversion.reversedAt);

  // Nutzer-Namen für Werber & Geworbene nachladen (bewusst keine FK-Relation).
  const userIds = [
    ...new Set(conversions.flatMap((c) => [c.referrerId, c.referredId])),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, avatarUrl: true },
      })
    : [];
  const userBy = new Map(users.map((u) => [u.id, u]));

  // Top-Werber aggregieren.
  const byReferrer = new Map<
    string,
    { joins: number; purchases: number; commissionCents: number }
  >();
  for (const c of activeConversions) {
    const agg = byReferrer.get(c.referrerId) ?? {
      joins: 0,
      purchases: 0,
      commissionCents: 0,
    };
    if (c.kind === "join") agg.joins++;
    else {
      agg.purchases++;
      agg.commissionCents += c.commissionCents;
    }
    byReferrer.set(c.referrerId, agg);
  }
  const topReferrers = [...byReferrer.entries()]
    .sort(
      (a, b) =>
        b[1].commissionCents - a[1].commissionCents || b[1].joins - a[1].joins,
    )
    .slice(0, 10);

  const totalJoins = activeConversions.filter((c) => c.kind === "join").length;
  const totalCommission = activeConversions.reduce((s, c) => s + c.commissionCents, 0);

  return (
    <div>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {/* Kennzahlen */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {t("statReferred")}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {nf.format(totalJoins)}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {t("statPurchases")}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {nf.format(activeConversions.filter((c) => c.kind === "purchase").length)}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {t("statCommission")}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {eur.format(totalCommission / 100)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {t("commissionNote")}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Einstellungen */}
      <Card className="mt-6">
        <CardBody>
          <h2 className="mb-1 text-sm font-bold text-slate-900">{t("provisionHeading")}</h2>
          <p className="mb-4 text-sm text-slate-500">
            {t("provisionDesc")}
          </p>
          <ReferralSettingsForm
            slug={slug}
            referralPercent={tenant.referralPercent}
          />
        </CardBody>
      </Card>

      {/* Top-Werber */}
      {topReferrers.length > 0 && (
        <Card className="mt-6">
          <CardBody>
            <h2 className="mb-3 text-sm font-bold text-slate-900">{t("topReferrers")}</h2>
            <ul className="divide-y divide-slate-100">
              {topReferrers.map(([userId, agg]) => {
                const u = userBy.get(userId);
                return (
                  <li key={userId} className="flex items-center gap-3 py-2.5">
                    <Avatar name={u?.name ?? t("unknown")} src={u?.avatarUrl} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                      {u?.name ?? t("unknownMember")}
                    </span>
                    <span className="text-xs text-slate-500">
                      {t("referredCount", { count: agg.joins })}
                      {agg.purchases > 0 && ` · ${t("purchasesSuffix", { count: agg.purchases })}`}
                    </span>
                    <span className="w-24 text-right text-sm font-semibold text-slate-900">
                      {eur.format(agg.commissionCents / 100)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Letzte Conversions */}
      <Card className="mt-6">
        <CardBody>
          <h2 className="mb-3 text-sm font-bold text-slate-900">
            {t("recentTitle")}
          </h2>
          {conversions.length === 0 ? (
            <EmptyState
              title={t("emptyTitle")}
              hint={t("emptyHint")}
              icon="megaphone"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {conversions.slice(0, 20).map((c) => {
                const referrer = userBy.get(c.referrerId);
                const referred = userBy.get(c.referredId);
                return (
                  <li
                    key={c.id}
                    className={`flex items-center gap-3 py-2.5 text-sm ${c.reversedAt ? "opacity-50 line-through" : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {t.rich(c.kind === "join" ? "convJoin" : "convPurchase", {
                        referrer: referrer?.name ?? "?",
                        referred: referred?.name ?? "?",
                        b: (chunks) => <span className="font-medium">{chunks}</span>,
                      })}
                    </span>
                    {c.kind === "purchase" && (
                      <span className="text-xs text-slate-500">
                        {eur.format(c.amountCents / 100)} →{" "}
                        <span className="font-semibold text-slate-800">
                          {eur.format(c.commissionCents / 100)}
                        </span>
                      </span>
                    )}
                    <span className="w-20 text-right text-xs text-slate-400">
                      {dateFmt.format(c.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
