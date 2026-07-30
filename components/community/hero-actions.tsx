"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/dashboard/icons";
import {
  HERO_MENU_ICON,
  heroMenuHref,
  heroMenuVisible,
  type HeroMenuConfig,
  type HeroMenuItem,
} from "@/lib/layout";
import { cn } from "@/lib/utils";

/**
 * Die Menüzeile der Kopfzeile.
 *
 * Was hier steht, stellt der Creator unter Layout → Menü zusammen; diese
 * Komponente ordnet nur an. Sie steckt in allen fünf Kopfzeilen-Stilen, das
 * Menü gilt damit überall, ohne dass ein Stil davon wissen muss.
 *
 * Zwei Fälle bleiben Sonderfälle: "Teilen" ist eine Aktion, kein Link, und
 * "Unterstützen" braucht die Adresse des Trinkgeld-Space, die je Community
 * anders heisst. Beides kommt von aussen herein statt hier zu entstehen.
 */
export function HeroActions({
  slug,
  isMember,
  isStaff,
  tipsHref,
  menu,
  tone = "ink",
}: {
  slug: string;
  isMember: boolean;
  isStaff: boolean;
  tipsHref?: string | null;
  /** Die gespeicherte Belegung. */
  menu: HeroMenuConfig;
  /**
   * "light" fuer Kopfzeilen auf dunklem Grund: die gefuellte Pille wird weiss
   * mit dunkler Schrift, die Umrisse werden hell. Die Markenfarbe traegt dort
   * nicht — sie steht ja schon als Flaeche dahinter.
   */
  tone?: "ink" | "light";
}) {
  const t = useTranslations("community.heroMenu");
  const light = tone === "light";
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function share() {
    const url = `${window.location.origin}/c/${slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ url });
        setOpen(false);
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1200);
    } catch {
      // user cancelled / clipboard unavailable — keep the menu open
    }
  }

  /**
   * Punkt auf Betrachter und Ziel prüfen. "Unterstützen" verschwindet ohne
   * Trinkgeld-Space von selbst — ein Menüpunkt, der auf nichts zeigt, ist
   * schlimmer als einer, der fehlt.
   */
  const resolve = (item: HeroMenuItem) => {
    if (!heroMenuVisible(item, { isMember, isStaff })) return null;
    const href = item.type === "TIPS" ? (tipsHref ?? null) : heroMenuHref(item, slug);
    if (item.type !== "SHARE" && !href) return null;
    // Eigene Beschriftung schlägt die Vorgabe; "Mitgliedschaft" heisst für
    // Gast und Mitglied nicht dasselbe.
    const fallback =
      item.type === "JOIN" ? (isMember ? t("type.MEMBERSHIP") : t("type.JOIN")) : t(`type.${item.type}`);
    return {
      item,
      href,
      label: item.label.trim() || fallback,
      icon: (item.icon ?? HERO_MENU_ICON[item.type]) as IconName,
    };
  };

  const resolved = menu.items.map(resolve).filter((x): x is NonNullable<typeof x> => !!x);
  const bar = resolved.filter((x) => x.item.slot === "BAR");
  const more = resolved.filter((x) => x.item.slot === "MORE");
  const showMore = menu.more.enabled && more.length > 0;

  if (bar.length === 0 && !showMore) return null;

  const barClass = (style: HeroMenuItem["style"]) => {
    if (style === "SOLID") {
      return cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-7 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2",
        light
          ? "bg-white text-[#161613] hover:bg-white/90 focus-visible:ring-white"
          : "bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] focus-visible:ring-[var(--brand-ring)]",
      );
    }
    if (style === "OUTLINE") {
      return cn(
        "inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2",
        light
          ? "border-white/40 text-white hover:border-white/80 hover:bg-white/10 focus-visible:ring-white"
          : "border-[#161613]/25 text-[#161613] hover:border-[#161613]/60 hover:bg-[#161613]/5 focus-visible:ring-[#161613]/30",
      );
    }
    return cn(
      "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2",
      light
        ? "text-white/85 hover:bg-white/10 hover:text-white focus-visible:ring-white"
        : "text-[#161613]/70 hover:bg-[#161613]/5 hover:text-[#161613] focus-visible:ring-[#161613]/30",
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      {bar.map((x) =>
        x.item.type === "SHARE" ? (
          <button key={x.item.id} type="button" onClick={share} className={barClass(x.item.style)}>
            <Icon name={copied ? "check" : x.icon} size={16} />
            {copied ? t("copied") : x.label}
          </button>
        ) : (
          <Link
            key={x.item.id}
            href={x.href!}
            {...(x.item.type === "LINK"
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            className={barClass(x.item.style)}
          >
            {/* Die gefuellte Pille traegt kein Zeichen — sie ist die eine
                Handlung, auf die alles zulaeuft, und bleibt eine Wortmarke. */}
            {x.item.style !== "SOLID" && <Icon name={x.icon} size={16} />}
            {x.label}
          </Link>
        ),
      )}

      {showMore && (
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={menu.more.label.trim() || t("more")}
            aria-haspopup="menu"
            aria-expanded={open}
            className={cn(
              "flex items-center justify-center gap-2 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2",
              menu.more.label.trim() ? "px-5 py-2.5 text-sm font-semibold" : "h-10 w-10",
              light
                ? "border-white/40 text-white hover:border-white/80 hover:bg-white/10 focus-visible:ring-white"
                : "border-[#161613]/25 text-[#161613] hover:border-[#161613]/60 hover:bg-[#161613]/5 focus-visible:ring-[#161613]/30",
            )}
          >
            <Icon name="more" size={20} />
            {menu.more.label.trim() && menu.more.label}
          </button>

          {open && (
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 cursor-default bg-[#161613]/25 sm:hidden"
            />
          )}
          {open && (
            <div
              role="menu"
              // Auf dem Handy ein Blatt am unteren Rand statt eines Dropdowns:
              // der Knopf steht mitten in der Zeile, ein 240px breites Menue
              // laeuft von dort aus je nach Ausrichtung links oder rechts aus dem
              // Bild. Ab sm haengt es wieder rechtsbuendig am Knopf.
              className="fixed inset-x-3 bottom-3 z-50 w-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:z-40 sm:mt-2 sm:w-60 sm:rounded-xl sm:shadow-xl"
            >
              {more.map((x) =>
                x.item.type === "SHARE" ? (
                  <button
                    key={x.item.id}
                    type="button"
                    role="menuitem"
                    onClick={share}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                  >
                    <Icon
                      name={copied ? "check" : x.icon}
                      size={17}
                      className={cn("shrink-0", copied ? "text-green-600" : "text-slate-400")}
                    />
                    {copied ? t("copied") : x.label}
                  </button>
                ) : (
                  <Link
                    key={x.item.id}
                    href={x.href!}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    {...(x.item.type === "LINK"
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                  >
                    <Icon name={x.icon} size={17} className="shrink-0 text-slate-400" />
                    {x.label}
                  </Link>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
