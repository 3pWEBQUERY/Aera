import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getCommunityContext } from "@/lib/guards";
import { Icon } from "@/components/dashboard/icons";
import { EmptyState, Pill } from "@/components/ui/misc";
import { formatDate, formatPrice } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("library");
  return { title: t("metaTitle") };
}

const orderStatusCls: Record<string, string> = {
  PAID: "bg-green-100 text-green-700",
  PENDING: "bg-amber-100 text-amber-700",
  REFUNDED: "bg-slate-100 text-slate-600",
  FAILED: "bg-red-100 text-red-700",
};
const orderStatusKey: Record<string, string> = {
  PAID: "statusPaid",
  PENDING: "statusPending",
  REFUNDED: "statusRefunded",
  FAILED: "statusFailed",
};

export default async function LibraryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, user, ctx } = community;
  const t = await getTranslations("library");
  const locale = await getLocale();

  if (!user) redirect(`/login?next=${encodeURIComponent(`/c/${slug}/library`)}`);
  if (ctx.membership?.status !== "ACTIVE" && !ctx.isStaff) {
    redirect(`/c/${slug}/join`);
  }

  // Owned media packages (via media:* entitlements) + free packages are
  // resolved against the current gallery inventory.
  const mediaKeys = [...ctx.keys].filter((k) => k.startsWith("media:"));
  const [ownedPackages, orders] = await Promise.all([
    mediaKeys.length
      ? prisma.mediaPackage.findMany({
          where: { tenantId: tenant.id, entitlementKey: { in: mediaKeys } },
          include: {
            space: { select: { slug: true } },
            _count: { select: { items: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.order.findMany({
      where: { tenantId: tenant.id, userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { product: { select: { name: true } } },
    }),
  ]);

  const hasContent = ownedPackages.length > 0 || orders.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("subtitle", { name: tenant.name })}
        </p>
      </div>

      {!hasContent && (
        <EmptyState
          icon="gallery"
          title={t("emptyTitle")}
          hint={t("emptyHint")}
        >
          <Link
            href={`/c/${slug}`}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {t("discover")}
          </Link>
        </EmptyState>
      )}

      {/* Freigeschaltete Medien */}
      {ownedPackages.length > 0 && (
        <section>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900">{t("unlockedMedia")}</h2>
            <Pill className="bg-slate-100 text-slate-500">{ownedPackages.length}</Pill>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ownedPackages.map((p) => (
              <Link
                key={p.id}
                href={`/c/${slug}/s/${p.space.slug}?open=${p.id}`}
                className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  {p.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.coverUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="bg-[var(--brand)] absolute inset-0 opacity-90" />
                  )}
                  <span className="absolute left-2 top-2">
                    <Pill className="bg-white/90 text-slate-700 backdrop-blur">
                      {p.priceCents > 0 ? t("purchased") : t("free")}
                    </Pill>
                  </span>
                </div>
                <div className="p-4">
                  <p className="truncate font-semibold text-slate-900 group-hover:text-[color:var(--brand)]">
                    {p.title}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <Icon name="gallery" size={13} />
                    {t("itemCount", { count: p._count.items })}
                    <span aria-hidden>·</span> {t("openDownload")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Bestellungen */}
      {orders.length > 0 && (
        <section>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900">{t("orders")}</h2>
            <Pill className="bg-slate-100 text-slate-500">{orders.length}</Pill>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {orders.map((o) => {
                const cls = orderStatusCls[o.status] ?? orderStatusCls.PENDING;
                const statusLabel = t(orderStatusKey[o.status] ?? "statusPending");
                return (
                  <li key={o.id} className="flex items-center gap-3 px-4 py-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                      <Icon name="products" size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {o.product?.name ?? o.description}
                      </p>
                      <p className="text-xs text-slate-400">{formatDate(o.createdAt, locale)}</p>
                    </div>
                    <Pill className={cls}>{statusLabel}</Pill>
                    <span className="w-20 shrink-0 text-right text-sm font-semibold text-slate-900">
                      {formatPrice(o.amountCents, o.currency, locale)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
