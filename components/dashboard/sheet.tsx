"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";
import { Icon, type IconName } from "./icons";
import { useTranslations } from "next-intl";

/**
 * Sheet that animates in from the bottom (slide-up) with a fading backdrop.
 * Controlled via `open` / `onClose`.
 *
 * Variants:
 * - "full"   — deckt den ganzen Viewport ab (Standard, Dashboard-Manager).
 * - "bottom" — iOS-Style Bottom-Sheet: volle Breite, unten bündig, nur oben
 *   abgerundete Ecken + Grabber-Handle. Die Höhe wächst mit dem Inhalt und
 *   ist bei 80% des Viewports gedeckelt (darüber scrollt der Inhalt).
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  icon = "spaces",
  logo,
  headerAction,
  variant = "full",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Ersetzt das Icon-Quadrat im Header (z. B. Creator-Logo). */
  logo?: React.ReactNode;
  /** Rendered in the header, just before the close button. */
  headerAction?: React.ReactNode;
  variant?: "full" | "bottom";
  children: React.ReactNode;
}) {
  const t = useTranslations("uiMigration.dashboard");
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const titleId = useId();
  const subtitleId = useId();
  const dialogRef = useModalAccessibility<HTMLDivElement>({
    open: mounted,
    onClose,
  });

  // WICHTIG: Das Sheet wird per Portal nach <body> gerendert. Ein Vorfahre mit
  // backdrop-filter/transform (z. B. der sticky Community-Header) würde sonst
  // zum Containing Block für `position: fixed` — das Sheet klebte dann am
  // Header statt am Viewport und der Seiteninhalt malte darüber.
  //
  // Die Brand-Variablen sind am Layout-Wurzel-Div des Tenants definiert und
  // gelten nicht an <body>; der unsichtbare Anker liest sie an der originalen
  // Baumposition aus und reicht sie an die Portal-Wurzel weiter.
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [brandVars, setBrandVars] = useState<React.CSSProperties>();
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const cs = getComputedStyle(anchorRef.current);
    setBrandVars({
      "--brand": cs.getPropertyValue("--brand"),
      "--brand-accent": cs.getPropertyValue("--brand-accent"),
    } as React.CSSProperties);
  }, [open]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  const anchor = <span ref={anchorRef} hidden />;
  if (!mounted || typeof document === "undefined") return anchor;

  return (
    <>
      {anchor}
      {createPortal(
        <div className="fixed inset-0 z-[60]" style={brandVars}>
          <div
            onClick={onClose}
            className={cn(
              "absolute inset-0 bg-slate-900/30 transition-opacity duration-300",
              shown ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={subtitle ? subtitleId : undefined}
            tabIndex={-1}
            className={cn(
              "absolute flex flex-col bg-white transition-transform duration-300 ease-out will-change-transform",
              variant === "bottom"
                ? "inset-x-0 bottom-0 max-h-[80%] overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(15,15,13,0.25)]"
                : "inset-0",
              shown ? "translate-y-0" : "translate-y-full",
            )}
          >
            {variant === "bottom" && (
              <div aria-hidden className="flex shrink-0 justify-center pb-1 pt-2.5">
                <span className="h-1 w-9 rounded-full bg-slate-300" />
              </div>
            )}
            <div
              className={cn(
                "flex shrink-0 items-center justify-between border-b border-slate-200 px-5",
                variant === "bottom" ? "h-14" : "h-16",
              )}
            >
              <div className="flex items-center gap-3">
                {logo ?? (
                  <span className="bg-[var(--brand)] flex h-8 w-8 items-center justify-center rounded-lg text-white">
                    <Icon name={icon} size={18} />
                  </span>
                )}
                <div>
                  <h2 id={titleId} className="text-sm font-semibold text-slate-900">{title}</h2>
                  {subtitle && <p id={subtitleId} className="text-xs text-slate-400">{subtitle}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {headerAction}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("close")}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <Icon name="close" size={20} />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
