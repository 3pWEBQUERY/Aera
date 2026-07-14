import { requireTenantAdmin } from "@/lib/guards";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { Icon, type IconName } from "@/components/dashboard/icons";

interface DatasetMeta {
  key: string;
  label: string;
  icon: IconName;
  count: number;
}

export async function generateMetadata() {
  const t = await getTranslations("dashboard.export");
  return { title: t("metaTitle") };
}

export default async function ExportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);
  const t = tenant.id;
  const tr = await getTranslations("dashboard.export");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale);

  const [
    members,
    entitlements,
    orders,
    subscriptions,
    posts,
    comments,
    products,
    courses,
    events,
    campaigns,
    segments,
  ] = await Promise.all([
    prisma.membership.count({ where: { tenantId: t } }),
    prisma.entitlement.count({ where: { tenantId: t } }),
    prisma.order.count({ where: { tenantId: t } }),
    prisma.subscription.count({ where: { tenantId: t } }),
    prisma.post.count({ where: { tenantId: t } }),
    prisma.comment.count({ where: { tenantId: t } }),
    prisma.product.count({ where: { tenantId: t } }),
    prisma.course.count({ where: { tenantId: t } }),
    prisma.event.count({ where: { tenantId: t } }),
    prisma.newsletterCampaign.count({ where: { tenantId: t } }),
    prisma.segment.count({ where: { tenantId: t } }),
  ]);

  const tDatasets = await getTranslations("dashboard.export.datasets");
  const datasets: DatasetMeta[] = [
    { key: "members", label: tDatasets("members"), icon: "members", count: members },
    { key: "orders", label: tDatasets("orders"), icon: "products", count: orders },
    { key: "subscriptions", label: tDatasets("subscriptions"), icon: "tiers", count: subscriptions },
    { key: "entitlements", label: tDatasets("entitlements"), icon: "lock", count: entitlements },
    { key: "posts", label: tDatasets("posts"), icon: "feed", count: posts },
    { key: "comments", label: tDatasets("comments"), icon: "forum", count: comments },
    { key: "products", label: tDatasets("products"), icon: "products", count: products },
    { key: "courses", label: tDatasets("courses"), icon: "courses", count: courses },
    { key: "events", label: tDatasets("events"), icon: "events", count: events },
    { key: "campaigns", label: tDatasets("campaigns"), icon: "newsletter", count: campaigns },
    { key: "segments", label: tDatasets("segments"), icon: "members", count: segments },
  ];

  const total = datasets.reduce((s, d) => s + d.count, 0);
  const base = `/api/tenant/${slug}/export`;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Icon name="export" size={20} />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{tr("title")}</h1>
          <p className="text-sm text-slate-400">{tr("subtitle")}</p>
        </div>
      </div>

      {/* Full export */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 text-white">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <Icon name="archive" size={18} className="text-white/80" />
              <h2 className="text-lg font-semibold">{tr("fullExport")}</h2>
            </div>
            <p className="mt-1.5 text-sm text-white/70">
              {tr("fullExportDesc", { count: nf.format(total) })}
            </p>
          </div>
          <a
            href={base}
            download
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            <Icon name="export" size={16} /> {tr("downloadJson")}
          </a>
        </div>
      </div>

      {/* Per-dataset */}
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-700">{tr("singleDatasets")}</h2>
        <span className="text-xs text-slate-400">{tr("csvOrJson")}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {datasets.map((d) => {
          const empty = d.count === 0;
          return (
            <div key={d.key} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <Icon name={d.icon} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{d.label}</p>
                  <p className="text-xs text-slate-400">
                    {tr("entries", { count: d.count })}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {empty ? (
                  <span className="flex-1 rounded-lg bg-slate-50 px-3 py-1.5 text-center text-xs font-medium text-slate-300">
                    {tr("noData")}
                  </span>
                ) : (
                  <>
                    <a
                      href={`${base}?dataset=${d.key}&format=csv`}
                      download
                      className="flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-center text-xs font-semibold text-white transition hover:bg-slate-800"
                    >
                      CSV
                    </a>
                    <a
                      href={`${base}?dataset=${d.key}&format=json`}
                      download
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-center text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      JSON
                    </a>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        {tr("footer")}
      </p>
    </div>
  );
}
