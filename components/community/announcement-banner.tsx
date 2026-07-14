"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/dashboard/icons";
import type { SpaceAnnouncement } from "@/lib/space-settings";

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000)); // whole minutes
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  return `${d}d : ${h}h : ${m}m`;
}

/** Live countdown towards `endsAt`, minute precision ("7d : 9h : 12m"). */
function Countdown({ endsAt, onExpire }: { endsAt: string; onExpire?: () => void }) {
  const target = new Date(endsAt).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const tick = () => {
      const next = target - Date.now();
      setRemaining(next);
      if (next <= 0) onExpire?.();
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [target, onExpire]);

  return <span className="tabular-nums">{formatRemaining(remaining)}</span>;
}

/**
 * Single announcement bar — also used as the live preview in the dashboard.
 * Colors and optional background image come from the announcement itself so
 * creators fully control the look.
 */
export function AnnouncementBar({
  announcement,
  preview = false,
}: {
  announcement: SpaceAnnouncement;
  preview?: boolean;
}) {
  const [expired, setExpired] = useState(false);
  const a = announcement;
  if (expired && !preview) return null;

  const cta =
    a.ctaLabel && a.ctaUrl ? (
      <a
        href={preview ? undefined : a.ctaUrl}
        onClick={preview ? (e) => e.preventDefault() : undefined}
        className="shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        style={{ backgroundColor: a.textColor, color: a.bgColor }}
      >
        {a.ctaLabel}
      </a>
    ) : null;

  return (
    <div className="relative overflow-hidden" style={{ backgroundColor: a.bgColor }}>
      {a.bgImageUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.bgImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Readability scrim in the banner color. */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: a.bgColor, opacity: 0.82 }}
          />
        </>
      )}
      <div
        className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-5 py-2.5 text-sm"
        style={{ color: a.textColor }}
      >
        <Icon name="clock" size={16} className="shrink-0 opacity-80" />
        <span className="font-semibold">{a.title}</span>
        {a.message && <span className="opacity-80">{a.message}</span>}
        {a.showTimer && a.endsAt && (
          <span className="opacity-80">
            <Countdown endsAt={a.endsAt} onExpire={() => setExpired(true)} />
          </span>
        )}
        {cta}
      </div>
    </div>
  );
}

/** Stack of all active announcements at the very top of community pages. */
export function AnnouncementBanner({
  announcements,
}: {
  announcements: SpaceAnnouncement[];
}) {
  if (announcements.length === 0) return null;
  return (
    <div className="divide-y divide-black/5">
      {announcements.map((a) => (
        <AnnouncementBar key={a.id} announcement={a} />
      ))}
    </div>
  );
}
