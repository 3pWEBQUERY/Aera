"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/dashboard/sheet";
import { Icon } from "@/components/dashboard/icons";
import type { SidebarItem } from "./sidebar";

/**
 * Burger-Button + iOS-Style Bottom-Sheet mit der Community-Navigation (nur
 * mobil). Bekommt dieselben Items wie die Desktop-Sidebar — also das vom
 * Creator im Layout-Editor konfigurierte Navigationsmenü (bzw. den Auto-
 * Fallback), damit Web- und Mobil-Ansicht identisch sind.
 */
export function MobileCommunityNav({
  name,
  logoUrl,
  items,
}: {
  name: string;
  /** Creator-Logo aus den Community-Einstellungen (Fallback: Initial). */
  logoUrl?: string | null;
  items: SidebarItem[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close after navigating.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menü öffnen"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
      >
        <Icon name="menu" size={20} />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={name}
        subtitle="Navigation"
        logo={
          logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] font-bold text-white">
              {name.charAt(0).toUpperCase()}
            </span>
          )
        }
        variant="bottom"
      >
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
          {items
            // Die dynamische "Zuletzt besucht"-Sektion gibt es nur im
            // Desktop-Rail — mobil zeigen wir die eigentlichen Menüpunkte.
            .filter((item) => !item.recent)
            .map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
                    active
                      ? "bg-[#161613]/5 text-[#161613]"
                      : "text-[#161613]/70 hover:bg-[#161613]/5",
                  )}
                >
                  <Icon
                    name={item.icon}
                    size={17}
                    className={cn(
                      "shrink-0",
                      active ? "text-[var(--brand)]" : "text-[#161613]/50",
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                </Link>
              );
            })}
        </nav>
      </Sheet>
    </div>
  );
}
