"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, isPathActive } from "@/lib/utils";
import { Icon } from "@/components/dashboard/icons";
import { spaceTypeIcon } from "@/lib/dashboard-nav-items";


const itemClass = (active: boolean) =>
  cn(
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
    active ? "bg-[#161613]/5 text-[#161613]" : "text-[#161613]/70 hover:bg-[#161613]/5",
  );

export function SpaceNav({
  slug,
  spaces,
}: {
  slug: string;
  spaces: { slug: string; name: string; type: string; locked: boolean }[];
}) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      <Link href={`/c/${slug}`} className={itemClass(pathname === `/c/${slug}`)}>
        <Icon name="home" size={17} className="shrink-0 text-[#161613]/50" />
        Start
      </Link>
      {spaces.map((s) => {
        const href = `/c/${slug}/s/${s.slug}`;
        const active = isPathActive(pathname, href);
        return (
          <Link key={s.slug} href={href} className={itemClass(active)}>
            <Icon
              name={spaceTypeIcon(s.type)}
              size={17}
              className={cn("shrink-0", active ? "text-[var(--brand)]" : "text-[#161613]/50")}
            />
            <span className="flex-1 truncate">{s.name}</span>
            {s.locked && (
              <Icon name="lock" size={14} className="shrink-0 text-[#161613]/50" />
            )}
          </Link>
        );
      })}
      <Link
        href={`/c/${slug}/leaderboard`}
        className={itemClass(isPathActive(pathname, `/c/${slug}/leaderboard`))}
      >
        <Icon name="gamification" size={17} className="shrink-0 text-[#161613]/50" />
        Leaderboard
      </Link>
      <Link
        href={`/c/${slug}/members`}
        className={itemClass(isPathActive(pathname, `/c/${slug}/members`))}
      >
        <Icon name="members" size={17} className="shrink-0 text-[#161613]/50" />
        Mitglieder
      </Link>
    </nav>
  );
}
