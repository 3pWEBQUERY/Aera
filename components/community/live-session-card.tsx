import Link from "next/link";
import { Pill } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { PlatformIcon, PLATFORM_COLORS } from "@/components/dashboard/platform-icons";
import { LIVE_PLATFORMS, detectLivePlatform } from "@/lib/live-embed";
import { cn } from "@/lib/utils";
import { LiveCountdown } from "./live-countdown";

/**
 * Gemeinsame Live-Session-Karte für die Community-Startseite (Sektion) und
 * die Live-Space-Seite: Status-Pill (LIVE pulsierend), Plattform-Badge mit
 * Original-Logo in Markenfarbe, Titel und Startzeit.
 */
export function LiveSessionCard({
  href,
  title,
  status,
  statusLabel,
  streamUrl,
  startsAtLabel,
  startsAtIso,
}: {
  href: string;
  title: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  statusLabel: string;
  streamUrl: string | null;
  startsAtLabel: string | null;
  startsAtIso?: string | null;
}) {
  const platform = streamUrl ? detectLivePlatform(streamUrl) : null;
  const info =
    platform && platform !== "custom" ? LIVE_PLATFORMS.find((p) => p.key === platform) : null;
  const isLive = status === "LIVE";
  // Anbieterfarbe steuert Rahmen und Hover-Schatten (Fallback: neutral).
  const pf = platform && platform !== "custom" ? PLATFORM_COLORS[platform] : "#161613";
  return (
    <Link
      href={href}
      style={{
        ["--pf" as string]: pf,
        ["--pf-soft" as string]: `${pf}59`,
        ["--pf-faint" as string]: `${pf}40`,
      }}
      className={cn(
        "group flex h-full flex-col rounded-2xl border bg-white p-5",
        "border-[color:var(--pf-faint)] transition-all duration-300 ease-out",
        "hover:-translate-y-1 hover:border-[color:var(--pf)]",
        "hover:shadow-[0_18px_40px_-18px_var(--pf-soft)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Pill
          className={
            isLive
              ? "bg-red-500/90 text-white"
              : status === "SCHEDULED"
                ? "bg-[#161613]/5 text-[#161613]/60"
                : "bg-[#161613]/5 text-[#161613]/45"
          }
        >
          {isLive && (
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          )}
          {statusLabel}
        </Pill>
        {info && platform && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#161613]/[0.04] px-2 py-1 text-xs font-medium text-[#161613]/70">
            <span className="flex shrink-0" style={{ color: PLATFORM_COLORS[platform] }}>
              <PlatformIcon platform={platform} size={14} />
            </span>
            {info.label}
          </span>
        )}
      </div>
      <h3 className="display-serif mt-3 truncate text-xl text-[#161613] transition group-hover:text-[color:var(--brand)]">
        {title}
      </h3>
      {status === "SCHEDULED" && startsAtIso && (
        <span className="mt-2 inline-flex items-center gap-1.5 self-start rounded-lg bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-semibold text-[color:var(--brand)]">
          <Icon name="clock" size={13} />
          <LiveCountdown startsAt={startsAtIso} />
        </span>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-[#161613]/50">
        <span className="inline-flex min-h-4 items-center gap-1.5">
          {startsAtLabel && (
            <>
              <Icon name="clock" size={13} />
              {startsAtLabel}
            </>
          )}
        </span>
        <span
          aria-hidden
          className="inline-flex -translate-x-1 items-center text-[color:var(--brand)] opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100"
        >
          <Icon name="chevron" size={14} className="-rotate-90" />
        </span>
      </div>
    </Link>
  );
}
