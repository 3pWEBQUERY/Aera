import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommunityContext } from "@/lib/guards";
import {
  listNotifications,
  markAllNotificationsRead,
  type NotificationRow,
} from "@/lib/notifications";
import { Card, CardBody } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { getLocale, getTranslations } from "next-intl/server";

export const metadata = { title: "Benachrichtigungen" };

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, user } = community;
  const [t, locale] = await Promise.all([
    getTranslations("notifications"),
    getLocale(),
  ]);
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  // The stored `message` is German; render from type + actor so every locale
  // sees its own language. Falls back to the stored text for unknown types.
  const notificationText = (n: NotificationRow): string =>
    n.actor ? t(`items.${n.type}`, { actor: n.actor.name }) : n.message;

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">{t("loginTitle")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("loginHint")}</p>
        <p className="mt-5 text-sm">
          <Link
            href={`/login?next=${encodeURIComponent(`/c/${slug}/notifications`)}`}
            className="font-medium text-[color:var(--brand)] hover:underline"
          >
            {t("loginCta")}
          </Link>
        </p>
      </div>
    );
  }

  const rows = await listNotifications(tenant.id, user.id, 50);
  // Ansehen gilt als Lesen — idempotent, doppelte Ausführung ist harmlos.
  await markAllNotificationsRead(tenant.id, user.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
          <Icon name="bell" size={20} />
        </span>
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardBody>
            <p className="py-6 text-center text-sm text-slate-500">{t("empty")}</p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {rows.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href}
                  className={`flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50 ${
                    n.readAt ? "" : "bg-[var(--brand-soft,#f8fafc)]"
                  }`}
                >
                  <Avatar
                    name={n.actor?.name ?? "Aera"}
                    src={n.actor?.avatarUrl ?? null}
                    size={36}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-800">{notificationText(n)}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {dateFmt.format(n.createdAt)}
                    </span>
                  </span>
                  {!n.readAt && (
                    <span
                      aria-label={t("unread")}
                      className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]"
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
