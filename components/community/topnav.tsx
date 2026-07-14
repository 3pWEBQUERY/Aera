"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface TopNavItem {
  href: string;
  label: string;
  /** Match the active state exactly instead of by prefix (used for home). */
  exact?: boolean;
}

/**
 * Horizontal community navigation (Patreon-style): text links with a brand
 * underline on the active item. Desktop only — mobile uses the burger sheet.
 */
export function CommunityTopNav({ items }: { items: TopNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden min-w-0 items-center gap-1 md:flex" aria-label="Community">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
              active
                ? "text-slate-900"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            {item.label}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-[var(--brand)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
