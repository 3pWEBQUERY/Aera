import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon } from "./icons";

/**
 * Seitenleiste fuer Moderatoren. Sie sehen im Dashboard nur die Moderation;
 * alle anderen Seiten verlangen ADMIN und leiten sie hierher zurueck
 * (lib/guards.ts). Eine volle Navigation mit lauter Zielen, die sie nicht
 * oeffnen duerfen, waere eine Liste von Sackgassen.
 */
export async function ModeratorNav({
  tenant,
}: {
  tenant: { slug: string; name: string; logoUrl: string | null; primaryColor: string };
}) {
  const t = await getTranslations("dashboard");
  const base = `/dashboard/${tenant.slug}`;
  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        <div>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {t("nav.moderatorGroup")}
          </p>
          <nav className="space-y-0.5">
            <Link
              href={`${base}/moderation`}
              aria-current="page"
              className="flex items-center gap-3 rounded-lg bg-[var(--action)] px-3 py-2 text-sm font-medium text-[var(--action-fg)]"
            >
              <Icon name="alert" size={18} className="shrink-0" />
              <span className="truncate">{t("nav.moderation")}</span>
            </Link>
            <Link
              href={`/c/${tenant.slug}`}
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-[var(--action-soft)] hover:text-slate-900"
            >
              <Icon name="external" size={18} className="shrink-0 text-slate-500 group-hover:text-slate-600" />
              <span className="truncate">{t("topbar.viewCommunity")}</span>
            </Link>
          </nav>
          <p className="mt-4 px-3 text-xs leading-5 text-slate-500">{t("nav.moderatorHint")}</p>
        </div>
      </div>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            {tenant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              tenant.name.charAt(0).toUpperCase()
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{tenant.name}</span>
            <span className="block text-xs text-slate-500">{t("nav.moderatorRole")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
