"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/dashboard/icons";

const typeIcon: Record<string, IconName> = {
  FEED: "feed",
  FORUM: "forum",
  COURSE: "courses",
  SHOP: "products",
  NEWSLETTER: "newsletter",
  EVENTS: "events",
  BLOG: "blog",
  KNOWLEDGE: "knowledge",
  GALLERY: "gallery",
  VIDEOS: "videos",
  CHAT: "chat",
  PODCAST: "podcast",
  LINKS: "link",
};

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
        const active = pathname.startsWith(href);
        return (
          <Link key={s.slug} href={href} className={itemClass(active)}>
            <Icon
              name={typeIcon[s.type] ?? "spaces"}
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
        className={itemClass(pathname.startsWith(`/c/${slug}/leaderboard`))}
      >
        <Icon name="gamification" size={17} className="shrink-0 text-[#161613]/50" />
        Leaderboard
      </Link>
      <Link
        href={`/c/${slug}/members`}
        className={itemClass(pathname.startsWith(`/c/${slug}/members`))}
      >
        <Icon name="members" size={17} className="shrink-0 text-[#161613]/50" />
        Mitglieder
      </Link>
    </nav>
  );
}
