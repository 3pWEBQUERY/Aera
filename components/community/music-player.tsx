"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toggleReactionAction } from "@/app/actions/engage";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";

/**
 * Musik-Player eines MUSIC-Space.
 *
 * Das Cover traegt die Buehne: einmal weit verwischt als Flaeche, einmal
 * scharf als Platte daneben. Dadurch faerbt jeder Track seine eigene Karte
 * ein, ohne dass irgendwo eine Farbe hinterlegt werden muesste — und
 * animierte Cover (GIF/WebP) laufen in beiden Ebenen mit.
 *
 * Gesperrte Titel bleiben in der Liste stehen, lassen sich aber nicht
 * abspielen: die Audiodatei wird fuer sie gar nicht erst ausgeliefert.
 */

export interface MusicTrack {
  id: string;
  title: string;
  href: string;
  /** null bei gesperrten Titeln — die Datei geht nicht ueber die Leitung. */
  audioUrl: string | null;
  coverUrl: string | null;
  artist: string;
  artistAvatar: string | null;
  likes: number;
  likedByMe: boolean;
  lockKind: "none" | "members" | "paid";
  priceLabel: string | null;
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MusicPlayer({
  slug,
  spaceSlug,
  tracks,
}: {
  slug: string;
  spaceSlug: string;
  tracks: MusicTrack[];
}) {
  const t = useTranslations("community.render.music");
  const audioRef = useRef<HTMLAudioElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [copied, setCopied] = useState(false);

  const track = tracks[index];
  const locked = !track || track.lockKind !== "none";
  const playable = tracks.some((x) => x.audioUrl);

  // Trackwechsel: von vorn, und weiterspielen, wenn gerade gespielt wurde.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    setPosition(0);
    setDuration(0);
    if (playing && track?.audioUrl) void el.play().catch(() => setPlaying(false));
  }, [index, playing, track?.audioUrl]);

  function toggle() {
    const el = audioRef.current;
    if (!el || !track?.audioUrl) return;
    if (el.paused) {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  function step(dir: 1 | -1) {
    if (tracks.length < 2) return;
    setIndex((i) => (i + dir + tracks.length) % tracks.length);
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current;
    if (!el || !duration) return;
    const box = e.currentTarget.getBoundingClientRect();
    el.currentTime = ((e.clientX - box.left) / box.width) * duration;
  }

  async function share() {
    if (!track) return;
    const url = `${window.location.origin}${track.href}`;
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Abgebrochen — nichts zu melden.
    }
  }

  if (!track) return null;
  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#161613]/10 bg-[#161613]">
      <div className="relative">
        {/* Verwischte Flaeche aus dem Cover — die Buehne. */}
        {track.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.coverUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl"
          />
        ) : (
          <span aria-hidden className="absolute inset-0 bg-[var(--brand)]" />
        )}
        <span aria-hidden className="absolute inset-0 bg-[#0b0810]/55" />

        <div className="relative flex items-center gap-4 p-4 sm:gap-6 sm:p-6">
          {/* Scharfe Platte */}
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/15 sm:h-36 sm:w-36">
            {track.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={track.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-white/10 text-white/50">
                <Icon name="music" size={30} />
              </span>
            )}
            {locked && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                <Icon name="lock" size={22} />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              {/* Die Plakette umschliesst den Namen, statt die Zeile zu
                  fuellen — sonst steht ein kurzer Name in einem langen,
                  leeren Balken. */}
              <div className="flex min-w-0 items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 backdrop-blur-sm">
                <Avatar name={track.artist} src={track.artistAvatar} size={26} />
                <span className="truncate text-xs font-semibold text-white/90">{track.artist}</span>
              </div>
              <button
                type="button"
                onClick={share}
                aria-label={t("share")}
                className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                <Icon name={copied ? "check" : "share"} size={16} />
              </button>
              <form action={toggleReactionAction}>
                <input type="hidden" name="tenant" value={slug} />
                <input type="hidden" name="space" value={spaceSlug} />
                <input type="hidden" name="postId" value={track.id} />
                <button
                  type="submit"
                  aria-pressed={track.likedByMe}
                  aria-label={track.likedByMe ? t("unlike") : t("like")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
                >
                  <Icon name="heart" size={16} fill={track.likedByMe ? "currentColor" : "none"} />
                </button>
              </form>
            </div>

            <Link
              href={track.href}
              className="mt-3 block truncate text-lg font-semibold text-white transition hover:opacity-80 sm:text-xl"
            >
              {track.title}
            </Link>

            <div className="mt-3 flex items-center gap-3 text-[11px] font-medium tabular-nums text-white/70">
              <span>{clock(position)}</span>
              <div
                onClick={seek}
                role="presentation"
                className="h-1 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/25"
              >
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span>-{clock(Math.max(0, duration - position))}</span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={tracks.length < 2}
                aria-label={t("previous")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/85 transition hover:bg-white/10 disabled:opacity-30"
              >
                <Icon name="skipBack" size={18} fill="currentColor" />
              </button>
              <button
                type="button"
                onClick={toggle}
                disabled={!track.audioUrl}
                aria-label={playing ? t("pause") : t("play")}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#161613] transition hover:scale-105 disabled:opacity-40"
              >
                <Icon name={playing ? "pause" : "play"} size={18} fill="currentColor" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={tracks.length < 2}
                aria-label={t("next")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/85 transition hover:bg-white/10 disabled:opacity-30"
              >
                <Icon name="skipForward" size={18} fill="currentColor" />
              </button>
              {locked && (
                <Link
                  href={track.lockKind === "paid" ? track.href : `/c/${slug}/join`}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
                >
                  <Icon name="lock" size={13} />
                  {track.lockKind === "paid" && track.priceLabel ? track.priceLabel : t("locked")}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {tracks.length > 1 && (
        <ol className="max-h-64 divide-y divide-white/10 overflow-y-auto bg-[#0b0810]">
          {tracks.map((x, i) => (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.06]",
                  i === index && "bg-white/[0.08]",
                )}
              >
                <span className="w-5 shrink-0 text-center text-xs tabular-nums text-white/40">
                  {i + 1}
                </span>
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white/10">
                  {x.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.coverUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-white/85">{x.title}</span>
                {x.lockKind !== "none" ? (
                  <Icon name="lock" size={13} className="shrink-0 text-white/45" />
                ) : (
                  i === index &&
                  playing && <Icon name="music" size={14} className="shrink-0 text-white/70" />
                )}
              </button>
            </li>
          ))}
        </ol>
      )}

      {playable && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          ref={audioRef}
          src={track.audioUrl ?? undefined}
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          onEnded={() => (tracks.length > 1 ? step(1) : setPlaying(false))}
          className="hidden"
        />
      )}
    </div>
  );
}
