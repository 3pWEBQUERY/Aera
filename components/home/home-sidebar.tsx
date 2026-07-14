"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { Avatar } from "@/components/ui/misc";
import { useTranslations } from "next-intl";

export interface SidebarCommunity {
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
}

const NAV: { href: string; labelKey: "home" | "discover" | "studio"; icon: IconName; exact?: boolean }[] = [
  { href: "/home", labelKey: "home", icon: "home", exact: true },
  { href: "/home?view=discover", labelKey: "discover", icon: "search" },
  { href: "/dashboard", labelKey: "studio", icon: "dashboard" },
];

/**
 * Persistent left sidebar for the discovery experience (Patreon-style):
 * brand mark, primary nav, the user's own communities, and an account
 * footer. Collapses to icons on medium screens, hides on mobile.
 */
export function HomeSidebar({
  communities,
  user,
  loggedIn,
}: {
  communities: SidebarCommunity[];
  user: { name: string; avatarUrl: string | null } | null;
  loggedIn: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("uiMigration.frontend.homeSidebar");

  return (
    <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex lg:w-64">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-3 lg:px-5">
        <Link
          href="/home"
          className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
        >
          <span className="bg-[var(--brand)] flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white shadow-sm">
            A
          </span>
          <span className="hidden text-lg font-black tracking-tight text-slate-950 lg:block">
            Aera
          </span>
        </Link>
      </div>

      {/* Primary nav */}
      <nav className="mt-1 space-y-1 px-2 lg:px-3">
        {NAV.map((item) => {
          const base = item.href.split("?")[0];
          const active = item.exact
            ? pathname === base && !`${item.href}`.includes("discover")
            : pathname.startsWith(base);
          return (
            <Link
              key={item.labelKey}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
                active
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Icon
                name={item.icon}
                size={20}
                className={cn("shrink-0", active ? "text-[var(--brand)]" : "text-slate-400")}
              />
              <span className="hidden lg:block">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      {/* User's communities */}
      {communities.length > 0 && (
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-2 lg:px-3">
          <p className="mb-1.5 hidden px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:block">
            {t("yourCommunities")}
          </p>
          <div className="space-y-0.5">
            {communities.map((c) => {
              const active = pathname.startsWith(`/c/${c.slug}`);
              return (
                <Link
                  key={c.slug}
                  href={`/c/${c.slug}`}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
                    active
                      ? "bg-slate-100 font-medium text-slate-900"
                      : "text-slate-600 hover:bg-slate-50",
                  )}
                  title={c.name}
                >
                  {c.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.logoUrl}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                      style={{ backgroundColor: c.primaryColor }}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="hidden truncate lg:block">{c.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer: create + account */}
      <div className="mt-auto space-y-3 border-t border-slate-100 p-2 lg:p-3">
        <Link
          href={loggedIn ? "/dashboard" : "/signup"}
          className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2"
        >
          <Icon name="plus" size={18} className="shrink-0" />
          <span className="hidden lg:block">{t("create")}</span>
        </Link>

        {user ? (
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
          >
            <Avatar name={user.name} src={user.avatarUrl} size={32} />
            <span className="hidden min-w-0 flex-1 lg:block">
              <span className="block truncate text-sm font-medium text-slate-900">
                {user.name}
              </span>
              <span className="block truncate text-xs text-slate-400">
                {t("memberships")}
              </span>
            </span>
          </button>
        ) : (
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Icon name="logout" size={16} className="shrink-0 rotate-180" />
            <span className="hidden lg:block">{t("login")}</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
