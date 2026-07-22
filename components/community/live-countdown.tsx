"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Tickender Countdown bis zum Startzeitpunkt einer geplanten Live-Session.
 * Rendert erst nach dem Mount (hydration-sicher) und aktualisiert sekündlich.
 * Ist die Startzeit erreicht, erscheint "Beginnt jeden Moment …".
 */
export function LiveCountdown({
  startsAt,
  className,
}: {
  startsAt: string;
  className?: string;
}) {
  const t = useTranslations("community.render.live");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null;

  const diff = new Date(startsAt).getTime() - now;
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) {
    return <span className={className}>{t("startsAnyMoment")}</span>;
  }

  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const hh = String(Math.floor((total % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  const time = days > 0 ? `${days}${t("daysShort")} ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;

  return (
    <span className={cn("tabular-nums", className)}>{t("startsIn", { time })}</span>
  );
}
