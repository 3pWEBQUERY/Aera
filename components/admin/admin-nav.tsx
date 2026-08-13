"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";

const items: { href: string; key: string; icon: IconName; exact?: boolean }[] = [
  { href: "/admin", key: "overview", icon: "dashboard", exact: true },
  { href: "/admin/communities", key: "communities", icon: "spaces" },
  { href: "/admin/users", key: "users", icon: "members" },
  { href: "/admin/media", key: "media", icon: "gallery" },
  { href: "/admin/posts", key: "posts", icon: "feed" },
  { href: "/admin/blog", key: "blog", icon: "blog" },
  { href: "/admin/orders", key: "orders", icon: "payouts" },
  { href: "/admin/codes", key: "codes", icon: "sparkles" },
  { href: "/admin/seo", key: "seo", icon: "search" },
  { href: "/admin/support", key: "support", icon: "messages" },
  { href: "/admin/help", key: "help", icon: "knowledge" },
  { href: "/admin/audit", key: "audit", icon: "clock" },
];

/**
 * Zaehler pro Navigationspunkt, Schluessel = item.key.
 *
 * Bewusst datengetrieben statt "jeder Punkt bekommt einen Kreis": ein Badge,
 * der immer 0 zeigt, traegt keine Information und stumpft gegen die ab, die
 * etwas bedeuten. Neue Zaehler werden hier einfach ergaenzt.
 */
export function AdminNav({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  const t = useTranslations("admin.nav");
  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
              active
                ? "bg-[var(--action)] text-[var(--action-fg)]"
                : "text-slate-600 hover:bg-[var(--action-soft)] hover:text-slate-900",
            )}
          >
            <Icon
              name={item.icon}
              size={17}
              className={cn("shrink-0", active ? "text-[var(--action-fg)]/70" : "text-slate-400")}
            />
            <span className="min-w-0 flex-1 truncate">{t(item.key)}</span>
            {(badges[item.key] ?? 0) > 0 && (
              <span
                aria-label={t("unreadAria", { count: badges[item.key]! })}
                className={cn(
                  "inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                  active ? "bg-white text-slate-900" : "bg-[var(--brand)] text-white",
                )}
              >
                {badges[item.key]! > 99 ? "99+" : badges[item.key]}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
