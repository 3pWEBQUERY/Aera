"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";
import { PlanBadge, PLAN_LABEL } from "./plan-badge";
import {
  minPlanForFeature,
  planAllowsFeature,
  type FeatureKey,
  type PlanKey,
} from "@/lib/plan-features";

interface NavItem {
  href: string;
  /** Leaf key within the `dashboard.nav` namespace. */
  labelKey: string;
  icon: IconName;
  /** Gated behind a package — the entry stays visible, but shows a lock. */
  feature?: FeatureKey;
}
export interface NavSpace {
  slug: string;
  name: string;
  type: string;
}

const groupsBefore: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "manage",
    items: [
      { href: "", labelKey: "overview", icon: "dashboard" },
      { href: "/spaces", labelKey: "spaces", icon: "spaces" },
      { href: "/media", labelKey: "media", icon: "gallery" },
      { href: "/planner", labelKey: "planner", icon: "events", feature: "planner" },
      { href: "/members", labelKey: "members", icon: "members" },
      { href: "/moderation", labelKey: "moderation", icon: "alert" },
    ],
  },
  {
    labelKey: "monetization",
    items: [
      { href: "/tiers", labelKey: "tiers", icon: "tiers" },
      { href: "/products", labelKey: "products", icon: "products", feature: "products" },
      { href: "/payouts", labelKey: "payouts", icon: "payouts", feature: "payouts" },
    ],
  },
];
const groupsAfter: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "growth",
    items: [
      { href: "/analytics", labelKey: "analytics", icon: "trendingUp", feature: "analytics" },
      { href: "/gamification", labelKey: "gamification", icon: "gamification", feature: "gamification" },
      { href: "/referrals", labelKey: "referrals", icon: "megaphone", feature: "referrals" },
      { href: "/automations", labelKey: "automations", icon: "clock", feature: "automations" },
    ],
  },
  {
    labelKey: "settingsGroup",
    items: [
      { href: "/layout", labelKey: "layout", icon: "layout" },
      { href: "/settings", labelKey: "settings", icon: "settings" },
      { href: "/developers", labelKey: "developers", icon: "bolt", feature: "developers" },
      { href: "/export", labelKey: "export", icon: "export", feature: "export" },
    ],
  },
];

// Keep in sync with the "New space" picker (components/dashboard/spaces-manager).
const typeIcon: Record<string, IconName> = {
  FEED: "feed",
  FORUM: "forum",
  COURSE: "courses",
  SHOP: "products",
  NEWSLETTER: "newsletter",
  EVENTS: "events",
  BLOG: "blog",
  KNOWLEDGE: "knowledge",
  GALLERY: "gallery",
  VIDEOS: "videos",
  CHAT: "chat",
  PODCAST: "podcast",
  LINKS: "link",
  ADS: "megaphone",
  LIVE: "videos",
  REQUESTS: "messages",
  BOOKING: "clock",
  STORIES: "sparkles",
  TIPS: "heart",
  CALENDAR: "events",
};

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

  function Group({ group }: { group: { labelKey: string; items: NavItem[] } }) {
    return (
      <div>
        <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t(`nav.${group.labelKey}`)}
        </p>
        <nav className="space-y-0.5">
          {group.items.map((it) => {
            const href = base + it.href;
            // Sub-pages (e.g. /media/studio) keep their section highlighted.
            const active =
              it.href === ""
                ? pathname === base
                : pathname === href || pathname.startsWith(`${href}/`);
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
                  active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Icon
                  name={it.icon}
                  size={18}
                  className={cn(
                    "shrink-0",
                    active ? "text-white" : "text-slate-400 group-hover:text-slate-600",
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
        {groupsBefore.map((g) => (
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
                const active = pathname === href;
                return (
                  <Link
                    key={s.slug}
                    href={href}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    <Icon name={typeIcon[s.type] ?? "spaces"} size={18} className={active ? "text-white" : "text-slate-400 group-hover:text-slate-600"} />
                    <span className="truncate">{s.name}</span>
                  </Link>
                );
              })
            )}
          </nav>
        </div>

        {groupsAfter.map((g) => (
          <Group key={g.labelKey} group={g} />
        ))}
      </div>

      <div className="space-y-3 border-t border-slate-200 p-3">
        <Link
          href={`${base}/assistant`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
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
