"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/dashboard/icons";

const links = [
  { href: "/home", key: "navDiscover" },
  { href: "/features", key: "navFeatures" },
  { href: "/pricing", key: "navPricing" },
  { href: "/hilfe", key: "navHelp" },
] as const;

/** Burger menu for the dark marketing header (below lg). */
export function MarketingMobileNav({ loggedIn }: { loggedIn: boolean }) {
  const t = useTranslations("marketing");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close after navigating.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? t("menuClose") : t("menuOpen")}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <Icon name={open ? "close" : "menu"} size={20} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <nav className="absolute inset-x-0 top-full z-50 border-b border-white/10 bg-[#161613] px-5 py-3 shadow-xl">
            <div className="grid gap-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {t(l.key)}
                </Link>
              ))}
              {!loggedIn && (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white sm:hidden"
                >
                  {t("login")}
                </Link>
              )}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
