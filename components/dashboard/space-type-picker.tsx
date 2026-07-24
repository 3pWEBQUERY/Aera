"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";
import { PlanBadge } from "./plan-badge";
import {
  SPACE_TYPE_KEYS,
  minPlanForSpaceType,
  planAllowsSpaceType,
  type PlanKey,
  type SpaceTypeKey,
} from "@/lib/plan-features";

/** Keep in sync with the nav's `typeIcon` map. */
export const SPACE_TYPE_ICON: Record<SpaceTypeKey, IconName> = {
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
  ADS: "megaphone",
  LIVE: "videos",
  REQUESTS: "messages",
  BOOKING: "clock",
  STORIES: "sparkles",
  TIPS: "heart",
  CALENDAR: "events",
};

/**
 * Space type grid with package awareness.
 *
 * Types the community cannot create yet are shown — dimmed, with the package
 * they belong to — instead of being hidden. Tapping one is not a dead end: it
 * hands control back to the caller, which opens the upgrade sheet.
 */
export function SpaceTypePicker({
  value,
  onChange,
  plan,
  onLocked,
  /** Types that cannot be switched away from / to (e.g. while editing). */
  disabledTypes,
}: {
  value: string;
  onChange: (type: string) => void;
  plan: PlanKey;
  onLocked: (requiredPlan: PlanKey) => void;
  disabledTypes?: string[];
}) {
  const t = useTranslations("dashboard");

  // Available types first, locked ones after — the ladder reads top to bottom.
  const ordered = [...SPACE_TYPE_KEYS].sort((a, b) => {
    const la = planAllowsSpaceType(plan, a) ? 0 : 1;
    const lb = planAllowsSpaceType(plan, b) ? 0 : 1;
    if (la !== lb) return la - lb;
    return SPACE_TYPE_KEYS.indexOf(a) - SPACE_TYPE_KEYS.indexOf(b);
  });

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {ordered.map((ty) => {
        const selected = ty === value;
        const locked = !planAllowsSpaceType(plan, ty);
        const required = minPlanForSpaceType(ty);
        const disabled = disabledTypes?.includes(ty) ?? false;
        return (
          <button
            key={ty}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => (locked ? onLocked(required) : onChange(ty))}
            className={cn(
              "relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
              selected && !locked
                ? "border-black bg-slate-50"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
              locked && "border-dashed bg-slate-50/60 hover:bg-slate-100/70",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {locked && (
              <span className="absolute right-2.5 top-2.5">
                <PlanBadge plan={required} locked />
              </span>
            )}
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                selected && !locked
                  ? "bg-slate-900 text-white"
                  : locked
                    ? "bg-white text-slate-300 ring-1 ring-slate-200"
                    : "bg-slate-100 text-slate-600",
              )}
            >
              <Icon name={SPACE_TYPE_ICON[ty]} size={20} />
            </span>
            <span className={cn("text-sm font-semibold", locked ? "text-slate-500" : "text-slate-900")}>
              {t(`spaceTypes.${ty}.label`)}
            </span>
            <span className="text-xs leading-tight text-slate-400">
              {t(`spaceTypes.${ty}.desc`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
