"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/dashboard/icons";
import { isExternalHref } from "@/lib/utils";
import type { BannerConfig } from "@/lib/layout";

/**
 * Einblendungen auf der Community-Seite.
 *
 * Drei Regeln, die diese Art Banner von Belaestigung unterscheiden, und die
 * hier bewusst im Code stehen statt in den Haenden des Creators:
 *
 * Es ist immer nur eine gleichzeitig zu sehen. Zwei Einblendungen
 * uebereinander sind keine zwei Botschaften, sondern eine verlorene.
 *
 * Wer eine weggeklickt hat, bekommt in derselben Sitzung keine weitere. Der
 * Creator kann sechs anlegen; niemand bekommt sechs.
 *
 * Auf den Seiten, die der Banner bewirbt — Beitritt, Konto —, erscheint er
 * nicht. Wer schon dort steht, muss nicht dorthin geschickt werden.
 */

/** Seiten, auf denen eine Einblendung nur im Weg staende. */
const MUTED_PATHS = ["/join", "/account", "/notifications"];

/** Merker je Banner. Getrennte Speicher, damit "Sitzung" auch Sitzung heisst. */
function storageKey(id: string) {
  return `aera_banner_${id}`;
}

function wasSeen(banner: BannerConfig): boolean {
  try {
    if (banner.frequency === "SESSION") {
      return window.sessionStorage.getItem(storageKey(banner.id)) === "1";
    }
    if (banner.frequency === "DISMISSED") {
      return window.localStorage.getItem(storageKey(banner.id)) === "1";
    }
  } catch {
    // Privater Modus: dann eben jedes Mal. Lieber einmal zu viel gezeigt als
    // eine Ausnahme, die die ganze Seite mitnimmt.
  }
  return false;
}

function rememberSeen(banner: BannerConfig) {
  try {
    if (banner.frequency === "SESSION") {
      window.sessionStorage.setItem(storageKey(banner.id), "1");
    } else if (banner.frequency === "DISMISSED") {
      window.localStorage.setItem(storageKey(banner.id), "1");
    }
  } catch {
    // siehe oben
  }
}

export function CommunityBanners({ banners }: { banners: BannerConfig[] }) {
  const pathname = usePathname();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  // Einmal weggeklickt heisst: fuer diesen Seitenaufruf ist Schluss.
  const closedThisVisit = useRef(false);

  const muted = MUTED_PATHS.some((p) => pathname.endsWith(p));

  /*
   * Der erste Banner, den dieser Besucher ueberhaupt noch sehen darf.
   *
   * Bewusst erst nach dem Mount ermittelt und nicht waehrend des Renderns:
   * der Server kennt weder Local- noch Session-Storage. Waehlte man dort, so
   * fiele die Wahl immer auf den ersten Banner — und der wuerde, einmal
   * dauerhaft weggeklickt, alle folgenden mit blockieren.
   */
  const [candidate, setCandidate] = useState<BannerConfig | null>(null);
  useEffect(() => {
    setCandidate(banners.find((b) => !wasSeen(b)) ?? null);
  }, [banners]);

  useEffect(() => {
    if (muted || closedThisVisit.current || !candidate) return;

    let cancelled = false;
    const open = () => {
      if (cancelled || closedThisVisit.current) return;
      setActiveId(candidate.id);
      // Erst im naechsten Bild sichtbar schalten, damit der Uebergang laeuft.
      requestAnimationFrame(() => !cancelled && setShown(true));
    };

    if (candidate.trigger === "IMMEDIATE") {
      open();
      return () => {
        cancelled = true;
      };
    }

    if (candidate.trigger === "SCROLL") {
      const onScroll = () => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        // Auf einer Seite, die kuerzer ist als das Fenster, kann man nicht
        // scrollen — dort zaehlt die Bedingung sofort als erfuellt.
        const percent = scrollable <= 0 ? 100 : (window.scrollY / scrollable) * 100;
        if (percent >= candidate.triggerValue) {
          window.removeEventListener("scroll", onScroll);
          open();
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      return () => {
        cancelled = true;
        window.removeEventListener("scroll", onScroll);
      };
    }

    if (candidate.trigger === "EXIT") {
      // Zeigefinger statt Maus: auf Touch-Geraeten gibt es keine Absicht,
      // das Fenster zu verlassen. Dort wird daraus eine Wartezeit, sonst
      // saehe die Haelfte der Besucher den Banner nie.
      const touch = window.matchMedia("(hover: none)").matches;
      if (touch) {
        const timer = setTimeout(open, 20_000);
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
      }
      const onLeave = (e: MouseEvent) => {
        if (e.clientY <= 0) {
          document.removeEventListener("mouseout", onLeave);
          open();
        }
      };
      document.addEventListener("mouseout", onLeave);
      return () => {
        cancelled = true;
        document.removeEventListener("mouseout", onLeave);
      };
    }

    const timer = setTimeout(open, Math.max(0, candidate.triggerValue) * 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candidate, muted]);

  const active = banners.find((b) => b.id === activeId) ?? null;

  const close = useCallback(() => {
    if (!active) return;
    closedThisVisit.current = true;
    setShown(false);
    rememberSeen(active);
    // Nach dem Ausblenden aus dem Baum nehmen, nicht davor.
    setTimeout(() => setActiveId(null), 250);
  }, [active]);

  if (!active) return null;
  return <BannerSurface banner={active} shown={shown} onClose={close} />;
}

/* ------------------------------------------------------------- Darstellung */

const TONE: Record<BannerConfig["tone"], { shell: string; title: string; text: string; close: string }> =
  {
    BRAND: {
      shell: "bg-[var(--brand)] text-white",
      title: "text-white",
      text: "text-white/75",
      close: "text-white/60 hover:bg-white/15 hover:text-white",
    },
    DARK: {
      shell: "bg-[#161613] text-white",
      title: "text-white",
      text: "text-white/70",
      close: "text-white/50 hover:bg-white/10 hover:text-white",
    },
    LIGHT: {
      shell: "border border-[#161613]/10 bg-white text-[#161613] shadow-[var(--shadow-card-lg)]",
      title: "text-[#161613]",
      text: "text-[#161613]/65",
      close: "text-[#161613]/35 hover:bg-[#161613]/5 hover:text-[#161613]",
    },
  };

function actionClass(tone: BannerConfig["tone"]): string {
  const base =
    "inline-flex shrink-0 items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold transition";
  if (tone === "LIGHT") return `${base} bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)]`;
  // Auf farbiger und dunkler Flaeche ist Weiss der einzige Knopf, der sicher
  // gegen jede Markenfarbe steht.
  return `${base} bg-white text-[#161613] hover:bg-white/90`;
}

function BannerSurface({
  banner,
  shown,
  onClose,
}: {
  banner: BannerConfig;
  shown: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("community.banner");
  const tone = TONE[banner.tone];
  const centered = banner.placement === "CENTER";

  // Escape schliesst — bei einem Fenster erwartet man das, und bei einer
  // Leiste schadet es nicht.
  useEffect(() => {
    if (!banner.dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [banner.dismissible, onClose]);

  const action =
    banner.label.trim() && banner.href ? (
      isExternalHref(banner.href) ? (
        <a
          href={banner.href}
          target="_blank"
          rel="noopener noreferrer"
          className={actionClass(banner.tone)}
        >
          {banner.label}
        </a>
      ) : (
        <Link href={banner.href} className={actionClass(banner.tone)}>
          {banner.label}
        </Link>
      )
    ) : null;

  const body = (
    <>
      <div className={centered ? "text-center" : "min-w-0 flex-1"}>
        {banner.title.trim() && (
          <p
            className={
              centered
                ? `display-serif text-2xl ${tone.title}`
                : `text-[15px] font-semibold ${tone.title}`
            }
          >
            {banner.title}
          </p>
        )}
        {banner.text.trim() && (
          <p className={`${centered ? "mt-3 text-[15px] leading-7" : "mt-0.5 text-sm"} ${tone.text}`}>
            {banner.text}
          </p>
        )}
      </div>
      <div
        className={
          centered
            ? "mt-6 flex flex-col items-stretch gap-2"
            : "flex shrink-0 items-center gap-2"
        }
      >
        {action}
        {banner.secondaryLabel.trim() && banner.dismissible && (
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tone.text} hover:opacity-100`}
          >
            {banner.secondaryLabel}
          </button>
        )}
      </div>
    </>
  );

  const closeButton = banner.dismissible && (
    <button
      type="button"
      onClick={onClose}
      aria-label={t("close")}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${tone.close}`}
    >
      <Icon name="close" size={17} />
    </button>
  );

  if (centered) {
    return (
      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center p-4 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className="absolute inset-0 bg-[#161613]/45"
          onClick={banner.dismissible ? onClose : undefined}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={banner.title || t("aria")}
          className={`relative w-full max-w-md rounded-3xl px-7 py-8 transition-transform duration-200 ${
            shown ? "translate-y-0" : "translate-y-3"
          } ${tone.shell}`}
        >
          <div className="absolute right-3 top-3">{closeButton}</div>
          {body}
        </div>
      </div>
    );
  }

  if (banner.placement === "CORNER") {
    return (
      <div
        className={`fixed bottom-4 right-4 z-[70] w-[min(22rem,calc(100vw-2rem))] rounded-2xl px-5 py-4 transition-all duration-300 ${
          shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        } ${tone.shell}`}
        role="region"
        aria-label={banner.title || t("aria")}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">{body}</div>
          {closeButton}
        </div>
      </div>
    );
  }

  const top = banner.placement === "TOP";
  return (
    <div
      role="region"
      aria-label={banner.title || t("aria")}
      className={`fixed inset-x-0 z-[70] transition-transform duration-300 ${
        top ? "top-0" : "bottom-0"
      } ${shown ? "translate-y-0" : top ? "-translate-y-full" : "translate-y-full"}`}
    >
      <div className={tone.shell}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5 sm:flex-nowrap sm:px-6">
          {body}
          {closeButton}
        </div>
      </div>
    </div>
  );
}
