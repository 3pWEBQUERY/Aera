"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn, initials } from "@/lib/utils";
import { Icon, type IconName } from "@/components/dashboard/icons";

/**
 * Schwebende Bottom-Tabbar für die Discover-Shell (nur mobil) im Stil der
 * iOS-Liquid-Glass-Bars: transluzente Kapsel mit Blur + Sättigung, Specular-
 * Highlight an der Oberkante, aktiver Tab als helle Glas-Linse. Versteckt
 * sich beim Runterscrollen und taucht beim Hochscrollen wieder auf.
 */
export function MobileTabbar({
  user,
}: {
  user: { name: string; avatarUrl: string | null } | null;
}) {
  const pathname = usePathname();
  const t = useTranslations("discover.tabbar");
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      // Mikro-Jitter ignorieren; nahe der Seitenoberkante nie verstecken.
      if (Math.abs(delta) < 8) return;
      setHidden(delta > 0 && y > 140);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const Tab = ({
    href,
    label,
    active = false,
    icon,
    children,
  }: {
    href: string;
    label: string;
    active?: boolean;
    icon?: IconName;
    children?: React.ReactNode;
  }) => (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative z-10 flex flex-1 flex-col items-center justify-center gap-1 rounded-[22px] py-2 transition-[color,transform] duration-200 active:scale-[0.92]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25",
        active ? "text-[#161613]" : "text-[#161613]/45",
      )}
    >
      {/* Aktive Glas-Linse hinter Icon + Label. */}
      {active && (
        <span
          aria-hidden
          className="absolute inset-x-1 inset-y-1 -z-10 rounded-[18px] bg-white/75 shadow-[0_2px_10px_rgba(15,15,13,0.10),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-[#161613]/5"
        />
      )}
      <span className="flex h-[22px] items-center justify-center">
        {children ?? <Icon name={icon ?? "home"} size={21} />}
      </span>
      <span className="text-[10px] font-semibold leading-none tracking-wide">
        {label}
      </span>
    </Link>
  );

  return (
    <nav
      aria-label={t("nav")}
      className={cn(
        "fixed inset-x-0 z-50 flex justify-center px-5 transition-[transform,opacity] duration-300 ease-out md:hidden",
        hidden ? "translate-y-[calc(100%+24px)] opacity-0" : "translate-y-0 opacity-100",
      )}
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div
        className={cn(
          "relative flex w-full max-w-sm items-stretch rounded-[26px] p-1",
          "bg-[#f8f5ee]/55 backdrop-blur-2xl backdrop-saturate-150",
          "ring-1 ring-[#161613]/10",
          "shadow-[0_16px_40px_rgba(15,15,13,0.18),0_2px_8px_rgba(15,15,13,0.08)]",
        )}
      >
        {/* Specular-Highlight: heller Lichtsaum oben, sanfter Verlauf ins Glas. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[26px]"
          style={{
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.75), inset 1px 0 0 rgba(255,255,255,0.25), inset -1px 0 0 rgba(255,255,255,0.25)",
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0.3), rgba(255,255,255,0) 45%)",
          }}
        />

        <Tab
          href="/home"
          icon="home"
          label={t("home")}
          active={pathname === "/home"}
        />
        <Tab href="/home#suche" icon="search" label={t("search")} />
        <Tab href="/start" icon="plus" label={t("create")} />
        {user ? (
          <Tab
            href="/member/account?from=/home"
            label={t("account")}
            active={pathname.startsWith("/member/account")}
          >
            <span className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-full bg-[#ece7dc] text-[9px] font-bold text-[#161613] ring-1 ring-[#161613]/10">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(user.name)
              )}
            </span>
          </Tab>
        ) : (
          <Tab href="/login?next=/home" icon="login" label={t("login")} />
        )}
      </div>
    </nav>
  );
}
