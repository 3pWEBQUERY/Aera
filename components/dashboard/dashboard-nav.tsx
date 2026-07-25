"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn, isPathActive } from "@/lib/utils";
import {
  NAV_GROUPS_AFTER,
  NAV_GROUPS_BEFORE,
  spaceTypeIcon,
  type DashboardNavGroup,
} from "@/lib/dashboard-nav-items";
import { Icon } from "./icons";
import { PlanBadge, PLAN_LABEL } from "./plan-badge";
import {
  minPlanForFeature,
  planAllowsFeature,
  type PlanKey,
} from "@/lib/plan-features";

export interface NavSpace {
  slug: string;
  name: string;
  type: string;
}

export function DashboardNav({
  tenant,
  spaces,
  plan,
}: {
  tenant: { slug: string; name: string; logoUrl: string | null; primaryColor: string };
  spaces: NavSpace[];
  /** Active creator package — drives the lock badges. */
  plan: PlanKey;
}) {
  const pathname = usePathname();
  const t = useTranslations("dashboard");
  const base = `/dashboard/${tenant.slug}`;

  function Group({ group }: { group: DashboardNavGroup }) {
    return (
      <div>
        <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t(`nav.${group.labelKey}`)}
        </p>
        <nav className="space-y-0.5">
          {group.items.map((it) => {
            const href = base + it.href;
            // Sub-pages (e.g. /media/studio) keep their section highlighted —
            // ausser der Eintrag ist als `exact` markiert, weil seine
            // Unterseiten eigene Eintraege haben.
            const active = isPathActive(pathname, href, it.href === "" || it.exact);
            // Locked entries stay visible on purpose: seeing what the next
            // package adds is what makes a creator click it.
            const locked = it.feature ? !planAllowsFeature(plan, it.feature) : false;
            return (
              <Link
                key={it.href}
                href={href}
                aria-label={
                  locked && it.feature
                    ? `${t(`nav.${it.labelKey}`)} — ${t("nav.lockedSuffix", { plan: PLAN_LABEL[minPlanForFeature(it.feature)] })}`
                    : undefined
                }
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-[var(--action)] text-[var(--action-fg)]" : "text-slate-600 hover:bg-[var(--action-soft)] hover:text-slate-900",
                )}
              >
                <Icon
                  name={it.icon}
                  size={18}
                  className={cn(
                    "shrink-0",
                    active ? "text-[var(--action-fg)]" : "text-slate-400 group-hover:text-slate-600",
                    locked && !active && "text-slate-300",
                  )}
                />
                <span className={cn("min-w-0 flex-1 truncate", locked && !active && "text-slate-400")}>
                  {t(`nav.${it.labelKey}`)}
                </span>
                {locked && it.feature && !active && (
                  <PlanBadge plan={minPlanForFeature(it.feature)} locked className="shrink-0" />
                )}
                {locked && active && (
                  <Icon name="lock" size={13} className="shrink-0 text-white/70" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV_GROUPS_BEFORE.map((g) => (
          <Group key={g.labelKey} group={g} />
        ))}

        {/* Dynamic spaces section */}
        <div>
          <div className="mb-1.5 flex items-center justify-between px-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t("nav.spaces")}</p>
            <Link href={`${base}/spaces`} className="text-slate-400 transition hover:text-slate-700" aria-label={t("nav.manageSpacesAria")}>
              <Icon name="plus" size={14} />
            </Link>
          </div>
          <nav className="space-y-0.5">
            {spaces.length === 0 ? (
              <p className="px-3 py-1.5 text-xs text-slate-400">{t("nav.noSpaces")}</p>
            ) : (
              spaces.map((s) => {
                const href = `${base}/spaces/${s.slug}`;
                const active = isPathActive(pathname, href);
                return (
                  <Link
                    key={s.slug}
                    href={href}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-[var(--action)] text-[var(--action-fg)]" : "text-slate-600 hover:bg-[var(--action-soft)] hover:text-slate-900",
                    )}
                  >
                    <Icon name={spaceTypeIcon(s.type)} size={18} className={active ? "text-[var(--action-fg)]" : "text-slate-400 group-hover:text-slate-600"} />
                    <span className="truncate">{s.name}</span>
                  </Link>
                );
              })
            )}
          </nav>
        </div>

        {NAV_GROUPS_AFTER.map((g) => (
          <Group key={g.labelKey} group={g} />
        ))}
      </div>

      <div className="space-y-3 border-t border-slate-200 p-3">
        <Link
          href={`${base}/assistant`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--action)] px-4 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)]"
        >
          <Icon name="sparkles" size={18} />
          {t("nav.aiAssistant")}
        </Link>
        <Link
          href={`${base}/settings`}
          className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-100"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            {tenant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logoUrl} alt={tenant.name} className="h-full w-full object-cover" />
            ) : (
              tenant.name.charAt(0).toUpperCase()
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{tenant.name}</span>
            <span className="block text-xs text-slate-400">{t("nav.yourCommunity")}</span>
          </span>
          <Icon name="settings" size={16} className="text-slate-400" />
        </Link>
      </div>
    </div>
  );
}
