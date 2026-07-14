"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { useTranslations } from "next-intl";

export interface RailCommunity {
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
}

function Tooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-[100] ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
    >
      {label}
    </span>
  );
}

export function CommunityRail({
  communities,
  activeSlug,
}: {
  communities: RailCommunity[];
  activeSlug: string;
}) {
  const t = useTranslations("uiMigration.dashboard");
  const pathname = usePathname();
  return (
    <nav className="relative z-30 flex h-full w-[72px] shrink-0 flex-col items-center gap-2 overflow-visible border-r border-slate-200 bg-white py-4">
      <Link
        href="/dashboard"
        className="bg-[var(--brand)] group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-lg font-bold text-white shadow-sm transition hover:rounded-2xl"
        aria-label={t("allCommunities")}
      >
        A
        <Tooltip label={t("allCommunities")} />
      </Link>

      <div className="h-px w-7 shrink-0 bg-slate-200" />

      <div className="flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto py-1">
        {communities.map((c) => {
          const active =
            c.slug === activeSlug || pathname.startsWith(`/dashboard/${c.slug}`);
          return (
            <Link
              key={c.slug}
              href={`/dashboard/${c.slug}`}
              className="group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden text-base font-semibold text-white transition-all duration-150 hover:rounded-[14px]"
              style={{
                backgroundColor: c.primaryColor,
                borderRadius: active ? 14 : 18,
                boxShadow: active
                  ? `0 0 0 2px #fff, 0 0 0 4px ${c.primaryColor}`
                  : "none",
              }}
              aria-label={c.name}
            >
              {c.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.logoUrl} alt={c.name} className="h-full w-full object-cover" />
              ) : (
                c.name.charAt(0).toUpperCase()
              )}
              <Tooltip label={c.name} />
            </Link>
          );
        })}
      </div>

      <div className="h-px w-7 shrink-0 bg-slate-200" />

      <Link
        href="/start"
        className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-dashed border-slate-300 text-slate-500 transition hover:rounded-[14px] hover:border-violet-400 hover:bg-violet-50 hover:text-violet-600"
        aria-label={t("newCommunity")}
      >
        <Icon name="plus" size={20} />
        <Tooltip label={t("createNewCommunity")} />
      </Link>
    </nav>
  );
}
