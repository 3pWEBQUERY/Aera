"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";
import { useTranslations } from "next-intl";

/**
 * Full-screen sheet that animates in from the bottom (slide-up) with a fading
 * backdrop. Controlled via `open` / `onClose`.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  icon = "spaces",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: IconName;
  children: React.ReactNode;
}) {
  const t = useTranslations("uiMigration.dashboard");
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-slate-900/30 transition-opacity duration-300",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "absolute inset-0 flex flex-col bg-white transition-transform duration-300 ease-out will-change-transform",
          shown ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-3">
            <span className="bg-[var(--brand)] flex h-8 w-8 items-center justify-center rounded-lg text-white">
              <Icon name={icon} size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
