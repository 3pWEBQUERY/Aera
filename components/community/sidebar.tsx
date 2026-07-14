"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { Avatar } from "@/components/ui/misc";
import { logoutAction } from "@/app/actions/auth";
import logo from "@/public/logo.svg";
import logoButton from "@/public/logo_button.svg";

export interface SidebarItem {
  href: string;
  label: string;
  icon: IconName;
  /** Match active state exactly instead of by prefix (used for the home link). */
  exact?: boolean;
  /** Renders the dynamic "Zuletzt besucht" section instead of a fixed link. */
  recent?: boolean;
}

export interface SidebarUser {
  name: string;
  avatarUrl: string | null;
}

/** A creator/community the visitor recently opened. */
export interface RecentCreator {
  slug: string;
  name: string;
  logoUrl: string | null;
  color: string;
}

const STORAGE_KEY = "aera:community-sidebar";
const RECENT_CREATORS_KEY = "aera:recent-creators";
const MAX_RECENT = 8;

const TOOLTIP_CLASS =
  "pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 origin-left scale-95 " +
  "whitespace-nowrap rounded-md bg-[#161613] px-2 py-1 text-xs font-medium text-white opacity-0 " +
  "shadow-md transition duration-150 group-hover:scale-100 group-hover:opacity-100";

/**
 * Collapsible community sidebar (desktop). Collapsed to an icon rail by
 * default and expandable to a labelled rail. Carries the primary navigation
 * plus the signed-in user's controls (dashboard / logout) pinned to the
 * bottom. Mobile keeps the burger sheet from the header.
 */
export function CommunitySidebar({
  items,
  user,
  slug,
  isStaff,
  isCreator = false,
  loginHref,
  currentCreator,
}: {
  items: SidebarItem[];
  user: SidebarUser | null;
  slug: string;
  isStaff: boolean;
  /** Owns a community or has a staff role somewhere → view switcher. */
  isCreator?: boolean;
  loginHref: string;
  currentCreator?: RecentCreator;
}) {
  const pathname = usePathname();
  const t = useTranslations("community.chrome");
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recentCreators, setRecentCreators] = useState<RecentCreator[]>([]);

  const accountHref = `/member/account?from=${encodeURIComponent(`/c/${slug}`)}`;

  // Close the switcher after navigating.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const hasRecent = items.some((i) => i.recent);

  // Remember the last choice, but always start collapsed on the server render.
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "expanded") setExpanded(true);
    } catch {
      /* storage unavailable — ignore */
    }
  }, []);

  // Load the visitor's recently-opened creators, then record the current one
  // at the front (most-recent-first, de-duplicated across all communities).
  useEffect(() => {
    if (!hasRecent) return;
    let list: RecentCreator[] = [];
    try {
      const raw = localStorage.getItem(RECENT_CREATORS_KEY);
      const parsed = raw ? (JSON.parse(raw) as RecentCreator[]) : [];
      if (Array.isArray(parsed)) list = parsed.filter((c) => c && c.slug && c.name);
    } catch {
      /* ignore */
    }

    if (currentCreator) {
      list = [currentCreator, ...list.filter((c) => c.slug !== currentCreator.slug)].slice(
        0,
        MAX_RECENT,
      );
      try {
        localStorage.setItem(RECENT_CREATORS_KEY, JSON.stringify(list));
      } catch {
        /* ignore */
      }
    }
    setRecentCreators(list);
  }, [hasRecent, currentCreator]);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "expanded" : "collapsed");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const rowClass = (active: boolean) =>
    cn(
      "group relative flex w-full items-center rounded-lg text-sm font-medium transition",
      expanded ? "gap-3 px-3 py-2" : "justify-center px-0 py-2.5",
      active
        ? "bg-white text-[#161613]"
        : "text-white/60 hover:bg-white/10 hover:text-white",
    );

  const RowInner = ({
    icon,
    label,
    active = false,
  }: {
    icon: IconName;
    label: string;
    active?: boolean;
  }) => (
    <>
      <Icon
        name={icon}
        size={19}
        className={cn(
          "shrink-0",
          active ? "text-[#161613]" : "text-white/45 group-hover:text-white/80",
        )}
      />
      {expanded ? (
        <span className="truncate">{label}</span>
      ) : (
        <>
          <span className="sr-only">{label}</span>
          <span role="tooltip" className={TOOLTIP_CLASS}>
            {label}
          </span>
        </>
      )}
    </>
  );

  return (
    <aside
      className={cn(
        "sticky top-0 z-50 hidden h-screen shrink-0 self-start flex-col border-r border-white/10 bg-[#0f0f0d] transition-[width] duration-200 md:flex",
        expanded ? "w-60" : "w-16",
      )}
      aria-label={t("navAria")}
    >
      {/* Aera logo + collapse / expand toggle */}
      <div
        className={cn(
          "flex items-center border-b border-white/10 p-2.5",
          expanded ? "justify-between gap-2 pl-3" : "justify-center",
        )}
      >
        {expanded ? (
          <>
            <Link
              href="/home"
              aria-label={t("aeraDiscover")}
              className="group flex min-w-0 flex-1 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <Image src={logo} alt="Aera" priority className="h-7 w-auto" />
            </Link>
            <button
              type="button"
              onClick={toggle}
              aria-label={t("collapse")}
              aria-expanded
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/55 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <Icon name="chevron" size={18} className="rotate-90 transition-transform" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={toggle}
            aria-label={t("expand")}
            aria-expanded={false}
            className="group relative flex h-11 w-11 items-center justify-center rounded-[12px] transition hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <Image src={logoButton} alt="Aera" className="h-9 w-9" />
            <span role="tooltip" className={TOOLTIP_CLASS}>
              {t("aeraExpand")}
            </span>
          </button>
        )}
      </div>

      {/* Primary navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {items.map((item, i) => {
          // Dynamic "Zuletzt besucht" section — lists other creators the
          // visitor recently opened. Only shown in the expanded state.
          if (item.recent) {
            if (!expanded) return null;
            const others = recentCreators.filter((c) => c.slug !== slug);
            return (
              <div key={`recent-${i}`} className="pt-3">
                <p className="flex items-center gap-1.5 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  <Icon name="clock" size={13} className="text-white/40" />
                  {item.label}
                </p>
                {others.length === 0 ? (
                  <p className="px-3 py-1.5 text-xs text-white/40">
                    {t("noRecentCreators")}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {others.map((c) => (
                      <Link key={c.slug} href={`/c/${c.slug}`} className={rowClass(false)}>
                        {c.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.logoUrl}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                            style={{ background: c.color }}
                          >
                            {c.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="truncate">{c.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={!expanded ? item.label : undefined}
              className={rowClass(active)}
            >
              <RowInner icon={item.icon} label={item.label} active={active} />
            </Link>
          );
        })}
      </nav>

      {/* User controls pinned to the bottom */}
      <div className="mt-auto border-t border-white/10 p-2">
        {user ? (
          <div className="relative space-y-1">
            {/* View switcher (creator ↔ member), anchored above the user row. */}
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  aria-hidden
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="menu"
                  className={cn(
                    "absolute z-50 rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-black/10",
                    expanded
                      ? "bottom-full left-0 right-0 mb-2"
                      : "bottom-0 left-full ml-3 w-64",
                  )}
                >
                  {isCreator && (
                    <Link
                      href="/dashboard"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-[#161613]/55 transition hover:bg-[#161613]/5 hover:text-[#161613]"
                    >
                      {t("yourPage")}
                      <span className="block h-5 w-5 rounded-full border-2 border-[#161613]/25" />
                    </Link>
                  )}
                  <Link
                    href={accountHref}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-between gap-3 rounded-xl bg-[#161613]/5 px-4 py-3 text-sm font-bold text-[#161613]"
                  >
                    {isCreator ? t("yourMemberships") : t("yourAccount")}
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#161613] text-white">
                      <Icon name="check" size={12} />
                    </span>
                  </Link>
                </div>
              </>
            )}

            {isCreator ? (
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={!expanded ? t("accountAndView") : undefined}
                className={cn(
                  "group relative flex w-full items-center rounded-lg text-left transition hover:bg-white/10",
                  expanded ? "gap-3 px-2 py-1.5" : "justify-center px-0 py-1.5",
                )}
              >
                <span className="flex shrink-0">
                  <Avatar name={user.name} src={user.avatarUrl} size={30} />
                </span>
                {expanded ? (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">
                        {user.name}
                      </span>
                      <span className="block truncate text-xs text-white/40">
                        {t("switchView")}
                      </span>
                    </span>
                    <Icon
                      name="chevron"
                      size={15}
                      className={cn(
                        "shrink-0 text-white/40 transition-transform",
                        menuOpen ? "" : "rotate-180",
                      )}
                    />
                  </>
                ) : (
                  <span role="tooltip" className={TOOLTIP_CLASS}>
                    {user.name}
                  </span>
                )}
              </button>
            ) : (
              <Link
                href={accountHref}
                aria-label={!expanded ? t("yourAccount") : undefined}
                className={cn(
                  "group relative flex w-full items-center rounded-lg transition hover:bg-white/10",
                  expanded ? "gap-3 px-2 py-1.5" : "justify-center px-0 py-1.5",
                )}
              >
                <span className="flex shrink-0">
                  <Avatar name={user.name} src={user.avatarUrl} size={30} />
                </span>
                {expanded ? (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      {user.name}
                    </span>
                    <span className="block truncate text-xs text-white/40">
                      {t("accountAndPurchases")}
                    </span>
                  </span>
                ) : (
                  <span role="tooltip" className={TOOLTIP_CLASS}>
                    {t("yourAccount")}
                  </span>
                )}
              </Link>
            )}

            {isStaff && (
              <Link
                href={`/dashboard/${slug}`}
                aria-label={!expanded ? t("dashboard") : undefined}
                className={rowClass(false)}
              >
                <RowInner icon="dashboard" label={t("dashboard")} />
              </Link>
            )}

            <form action={logoutAction}>
              <button type="submit" aria-label={!expanded ? t("logout") : undefined} className={rowClass(false)}>
                <RowInner icon="logout" label={t("logout")} />
              </button>
            </form>
          </div>
        ) : (
          <Link
            href={loginHref}
            aria-label={!expanded ? t("login") : undefined}
            className={rowClass(false)}
          >
            <RowInner icon="login" label={t("login")} />
          </Link>
        )}
      </div>
    </aside>
  );
}
