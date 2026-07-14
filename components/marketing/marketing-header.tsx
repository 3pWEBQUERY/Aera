"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MarketingMobileNav } from "./mobile-nav";
import { LanguagePopover } from "./language-popover";
import logo from "@/public/logo.svg";

const pillCta =
  "inline-flex min-h-9 items-center justify-center rounded-full px-4 text-sm font-semibold " +
  "bg-white text-[#161613] transition-colors duration-200 hover:bg-[#ece7dc]";

/**
 * Marketing header: lies transparent on the dark hero and switches to a
 * solid, blurred bar once the page is scrolled.
 */
export function MarketingHeader({ loggedIn }: { loggedIn: boolean }) {
  const t = useTranslations("marketing");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled
          ? "border-b border-white/10 bg-[#0f0f0d]/90 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <Image
            src={logo}
            alt="Aera"
            priority
            className="h-7 w-auto"
          />
        </Link>

        <nav
          className={`hidden items-center gap-1 rounded-full border p-1 text-sm font-semibold text-white/70 transition-colors duration-300 lg:flex ${
            scrolled ? "border-white/15 bg-white/5" : "border-transparent"
          }`}
        >
          <Link
            href="/home"
            className="rounded-full px-4 py-2 transition-colors hover:bg-white/10 hover:text-white"
          >
            {t("navDiscover")}
          </Link>
          <Link
            href="/features"
            className="rounded-full px-4 py-2 transition-colors hover:bg-white/10 hover:text-white"
          >
            {t("navFeatures")}
          </Link>
          <Link
            href="/pricing"
            className="rounded-full px-4 py-2 transition-colors hover:bg-white/10 hover:text-white"
          >
            {t("navPricing")}
          </Link>
          <Link
            href="/hilfe"
            className="rounded-full px-4 py-2 transition-colors hover:bg-white/10 hover:text-white"
          >
            {t("navHelp")}
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <MarketingMobileNav loggedIn={loggedIn} />
          <LanguagePopover />
          {loggedIn ? (
            <Link href="/dashboard" className={pillCta}>
              {t("toDashboard")}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-sm font-semibold text-white/70 transition-colors hover:text-white sm:inline"
              >
                {t("login")}
              </Link>
              <Link href="/signup?next=/start" className={`${pillCta} px-5`}>
                <span className="hidden sm:inline">{t("startCommunity")}</span>
                <span className="sm:hidden">{t("startShort")}</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
