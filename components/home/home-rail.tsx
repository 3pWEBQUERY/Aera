"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { cn, initials } from "@/lib/utils";
import logoButton from "@/public/logo_button.svg";

export interface RailMembership {
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
}

function Tooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#161613] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
      {label}
    </span>
  );
}

function RailIcon({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: IconName;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
        active
          ? "bg-white text-[#161613]"
          : "text-white/55 hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon name={icon} size={21} />
      <Tooltip label={label} />
    </Link>
  );
}

/**
 * Public app rail (discover shell): brand tile, home/discover shortcuts,
 * the user's communities as avatar tiles, create + account at the bottom.
 */
export function HomeRail({
  memberships,
  user,
}: {
  memberships: RailMembership[];
  user: { name: string; avatarUrl: string | null } | null;
}) {
  const pathname = usePathname();
  const t = useTranslations("discover.rail");

  return (
    <nav
      aria-label={t("mainNav")}
      className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col items-center gap-2 border-r border-white/10 bg-[#0f0f0d] py-4 md:flex"
    >
      <Link
        href="/"
        aria-label={t("home")}
        className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <Image src={logoButton} alt="" className="h-9 w-9" />
        <Tooltip label={t("home")} />
      </Link>

      <div className="h-px w-7 shrink-0 bg-white/10" />

      <RailIcon href="/home" icon="home" label={t("home")} active={pathname === "/home"} />
      <RailIcon href="/home#suche" icon="search" label={t("discover")} />
      {user && <RailIcon href="/dashboard" icon="dashboard" label={t("myCommunities")} />}

      {memberships.length > 0 && (
        <>
          <div className="mt-1 h-px w-7 shrink-0 bg-white/10" />
          <div className="flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto overflow-x-hidden py-1">
            {memberships.map((m) => (
              <Link
                key={m.slug}
                href={`/c/${m.slug}`}
                aria-label={m.name}
                className="group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[18px] text-base font-semibold text-white transition-all duration-150 hover:rounded-xl"
                style={{ backgroundColor: m.primaryColor }}
              >
                {m.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  m.name.charAt(0).toUpperCase()
                )}
                <Tooltip label={m.name} />
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="mt-auto flex shrink-0 flex-col items-center gap-2 pt-2">
        <Link
          href="/start"
          aria-label={t("create")}
          className="group relative flex h-11 w-11 items-center justify-center rounded-xl text-white/55 transition hover:bg-white/10 hover:text-white"
        >
          <Icon name="plus" size={22} />
          <Tooltip label={t("create")} />
        </Link>
        {user ? (
          <Link
            href="/dashboard"
            aria-label={t("account")}
            className="group relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[#ece7dc] text-sm font-bold text-[#161613] ring-1 ring-white/15"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(user.name)
            )}
            <Tooltip label={user.name} />
          </Link>
        ) : (
          <RailIcon href="/login?next=/home" icon="logout" label={t("login")} />
        )}
      </div>
    </nav>
  );
}
