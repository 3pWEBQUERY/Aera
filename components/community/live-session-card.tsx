import Link from "next/link";
import { Pill } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { PlatformIcon, PLATFORM_COLORS } from "@/components/dashboard/platform-icons";
import { LIVE_PLATFORMS, detectLivePlatform } from "@/lib/live-embed";
import { cn } from "@/lib/utils";
import { LiveCountdown } from "./live-countdown";

/**
 * Gemeinsame Live-Session-Karte für die Community-Startseite (Sektion), die
 * Live-Space-Seite und die Live-Übersicht. Drei klar lesbare Zustände:
 *
 * - LIVE: dunkle "Bühne" mit pinging rotem Live-Punkt, Glow und CTA —
 *   als `featured` die grosse Hero-Karte, wenn eine Sendung die Seite fuer
 *   sich allein hat.
 * - Geplant: helle Karte mit Countdown im Vordergrund.
 * - Aufzeichnung: ruhige Archiv-Karte mit Wiedergabe-Verweis.
 */
export function LiveSessionCard({
  href,
  title,
  status,
  statusLabel,
  streamUrl,
  ownStreamLabel,
  startsAtLabel,
  startsAtIso,
  watchNowLabel,
  watchReplayLabel,
  featured = false,
}: {
  href: string;
  title: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  statusLabel: string;
  streamUrl: string | null;
  /** Gesetzt, wenn der Stream ueber Aera laeuft — dann steht das statt einer Plattform. */
  ownStreamLabel?: string | null;
  startsAtLabel: string | null;
  startsAtIso?: string | null;
  watchNowLabel?: string;
  watchReplayLabel?: string;
  /** Grosse Buehne, wenn die laufende Sendung allein im Rampenlicht steht. */
  featured?: boolean;
}) {
  const platform = ownStreamLabel ? null : streamUrl ? detectLivePlatform(streamUrl) : null;
  const info =
    platform && platform !== "custom" ? LIVE_PLATFORMS.find((p) => p.key === platform) : null;
  const isLive = status === "LIVE";
  // Anbieterfarbe steuert Akzente (Fallback: neutral).
  const pf = platform && platform !== "custom" ? PLATFORM_COLORS[platform] : "#161613";

  const badge = ownStreamLabel ? (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium",
        isLive ? "bg-white/10 text-white/85" : "bg-[var(--brand-soft)] text-[color:var(--brand)]",
      )}
    >
      <Icon name="broadcast" size={13} />
      {ownStreamLabel}
    </span>
  ) : (
    info &&
    platform && (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium",
          isLive ? "bg-white/10 text-white/85" : "bg-[#161613]/[0.04] text-[#161613]/70",
        )}
      >
        <span className="flex shrink-0" style={{ color: PLATFORM_COLORS[platform] }}>
          <PlatformIcon platform={platform} size={14} />
        </span>
        {info.label}
      </span>
    )
  );

  if (isLive) {
    return (
      <Link
        href={href}
        style={{ ["--pf" as string]: pf }}
        className={cn(
          "group relative flex h-full flex-col overflow-hidden rounded-2xl bg-[#161613] text-white",
          "ring-1 ring-white/10 transition duration-300",
          "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-red-500/10 hover:ring-white/25",
          featured ? "p-6 sm:p-9" : "p-5",
        )}
      >
        {/* Buehnenlicht: roter Schimmer oben, Marken-Glow unten */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-0 h-56 w-56 rounded-full bg-red-500/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[var(--brand)] opacity-20 blur-3xl"
        />

        <div className="relative flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_0_18px_rgba(239,68,68,0.5)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            {statusLabel}
          </span>
          {badge}
        </div>

        <h3
          className={cn(
            "display-serif relative mt-4 line-clamp-2 text-white",
            featured ? "text-3xl sm:text-4xl" : "text-xl",
          )}
        >
          {title}
        </h3>

        <div className="relative mt-auto flex items-end justify-between gap-3 pt-6">
          <span className="inline-flex min-h-4 items-center gap-1.5 text-xs text-white/45">
            {startsAtLabel && (
              <>
                <Icon name="clock" size={13} />
                {startsAtLabel}
              </>
            )}
          </span>
          {watchNowLabel && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--action)] font-semibold text-[var(--action-fg)] transition group-hover:bg-[var(--action-hover)]",
                featured ? "px-5 py-2.5 text-sm" : "px-4 py-2 text-xs",
              )}
            >
              <Icon name="play" size={featured ? 15 : 13} />
              {watchNowLabel}
            </span>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      style={{
        ["--pf" as string]: pf,
        ["--pf-faint" as string]: `${pf}40`,
      }}
      className={cn(
        "group flex h-full flex-col rounded-2xl border bg-white p-5",
        "border-[color:var(--pf-faint)] transition-colors duration-200",
        "hover:border-[color:var(--pf)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Pill
          className={
            status === "SCHEDULED"
              ? "bg-[#161613]/5 text-[#161613]/60"
              : "bg-[#161613]/5 text-[#161613]/45"
          }
        >
          {statusLabel}
        </Pill>
        {badge}
      </div>
      <h3 className="display-serif mt-3 line-clamp-2 text-xl text-[#161613] transition group-hover:text-[color:var(--brand)]">
        {title}
      </h3>
      {status === "SCHEDULED" && startsAtIso && (
        <span className="mt-3 inline-flex items-center gap-1.5 self-start rounded-lg bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-semibold text-[color:var(--brand)]">
          <Icon name="clock" size={13} />
          <LiveCountdown startsAt={startsAtIso} />
        </span>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-[#161613]/50">
        <span className="inline-flex min-h-4 items-center gap-1.5">
          {startsAtLabel && (
            <>
              <Icon name="clock" size={13} />
              {startsAtLabel}
            </>
          )}
        </span>
        {status === "ENDED" && watchReplayLabel ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-[#161613]/55 transition group-hover:text-[color:var(--brand)]">
            <Icon name="play" size={13} />
            {watchReplayLabel}
          </span>
        ) : (
          <span
            aria-hidden
            className="inline-flex -translate-x-1 items-center text-[color:var(--brand)] opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100"
          >
            <Icon name="chevron" size={14} className="-rotate-90" />
          </span>
        )}
      </div>
    </Link>
  );
}
