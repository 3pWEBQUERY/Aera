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
  { href: "/admin/orders", key: "orders", icon: "payouts" },
  { href: "/admin/codes", key: "codes", icon: "sparkles" },
  { href: "/admin/help", key: "help", icon: "knowledge" },
  { href: "/admin/audit", key: "audit", icon: "clock" },
];

export function AdminNav() {
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
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <Icon
              name={item.icon}
              size={17}
              className={cn("shrink-0", active ? "text-white/80" : "text-slate-400")}
            />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
