import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { Avatar, Pill } from "@/components/ui/misc";
import { formatDate, formatPrice } from "@/lib/utils";
import { PLATFORM_CURRENCY } from "@/lib/currency";
import { systemPrisma } from "@/lib/prisma";
import { staffUnreadCount } from "@/lib/support";

function Stat({
  icon,
  label,
  value,
  href,
}: {
  icon: IconName;
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--action)] text-[var(--action-fg)]">
        <Icon name={icon} size={18} />
      </span>
      <p className="mt-3 text-2xl font-bold leading-none text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-400">{label}</p>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
    >
      {inner}
    </Link>
  ) : (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">{inner}</div>
  );
}

export default async function AdminOverviewPage() {
  await requirePlatformAdmin();
  const t = await getTranslations("admin.overview");
  const ts = await getTranslations("admin.support.widget");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale);

  const [tenants, users, memberships, posts, orders, revenue, latestTenants, latestUsers, openTickets, unreadSupport] =
    await Promise.all([
      prisma.tenant.count(),
      prisma.user.count(),
      prisma.membership.count({ where: { status: "ACTIVE" } }),
      prisma.post.count(),
      prisma.order.count({ where: { status: "PAID" } }),
      prisma.order.aggregate({
        where: { status: "PAID" },
        _sum: { amountCents: true, platformFeeCents: true },
      }),
      prisma.tenant.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          createdAt: true,
          _count: { select: { memberships: true } },
        },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true },
      }),
      systemPrisma.supportTicket.findMany({
        where: { status: { not: "CLOSED" } },
        orderBy: { lastMessageAt: "desc" },
        take: 5,
        select: {
          id: true, subject: true, email: true, name: true,
          status: true, lastMessageAt: true,
        },
      }),
      staffUnreadCount(),
    ]);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("subtitle")}
        </p>
      </div>

      {/* Offene Tickets zuerst: das ist das Einzige auf dieser Seite, das auf
          eine Reaktion wartet. Zahlen koennen warten, Menschen nicht. */}
      {openTickets.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--action)] text-[var(--action-fg)]">
                <Icon name="messages" size={16} />
              </span>
              <h2 className="text-sm font-bold text-slate-900">{ts("title")}</h2>
              {unreadSupport > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {unreadSupport > 99 ? "99+" : unreadSupport}
                </span>
              )}
            </div>
            <Link
              href="/admin/support"
              className="text-sm font-semibold text-slate-500 transition hover:text-slate-900"
            >
              {ts("all")}
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {openTickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href="/admin/support"
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {ticket.subject}
                    </span>
                    <span className="block truncate text-xs text-slate-400">
                      {ticket.name || ticket.email} · {formatDate(ticket.lastMessageAt, locale)}
                    </span>
                  </span>
                  <Pill
                    className={
                      ticket.status === "OPEN"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700"
                    }
                  >
                    {ts(`status.${ticket.status}`)}
                  </Pill>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat icon="spaces" label={t("communities")} value={nf.format(tenants)} href="/admin/communities" />
        <Stat icon="members" label={t("users")} value={nf.format(users)} href="/admin/users" />
        <Stat icon="check" label={t("activeMemberships")} value={nf.format(memberships)} />
        <Stat icon="feed" label={t("posts")} value={nf.format(posts)} />
        <Stat icon="payouts" label={t("paidOrders")} value={nf.format(orders)} href="/admin/orders" />
        <Stat
          icon="tiers"
          label={t("revenueWithFee", { fee: formatPrice(revenue._sum.platformFeeCents ?? 0, PLATFORM_CURRENCY, locale) })}
          value={formatPrice(revenue._sum.amountCents ?? 0, PLATFORM_CURRENCY, locale)}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t("latestCommunities")}</h2>
            <Link
              href="/admin/communities"
              className="text-sm font-medium text-[color:var(--brand)] hover:underline"
            >
              {t("viewAll")}
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {latestTenants.map((tenant) => (
              <li key={tenant.id} className="flex items-center gap-3">
                {tenant.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tenant.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--action)] text-sm font-bold text-[var(--action-fg)]">
                    {tenant.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{tenant.name}</p>
                  <p className="truncate text-xs text-slate-400">
                    /c/{tenant.slug} · {formatDate(tenant.createdAt, locale)}
                  </p>
                </div>
                <Pill className="shrink-0 bg-slate-100 text-slate-500">
                  {t("membersShort", { count: tenant._count.memberships })}
                </Pill>
              </li>
            ))}
            {latestTenants.length === 0 && (
              <li className="text-sm text-slate-400">{t("noCommunities")}</li>
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t("latestUsers")}</h2>
            <Link
              href="/admin/users"
              className="text-sm font-medium text-[color:var(--brand)] hover:underline"
            >
              {t("viewAll")}
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {latestUsers.map((u) => (
              <li key={u.id} className="flex items-center gap-3">
                <Avatar name={u.name} src={u.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{u.name}</p>
                  <p className="truncate text-xs text-slate-400">{u.email}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatDate(u.createdAt, locale)}
                </span>
              </li>
            ))}
            {latestUsers.length === 0 && (
              <li className="text-sm text-slate-400">{t("noUsers")}</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
