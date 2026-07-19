"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/dashboard/icons";

/**
 * Leichtgewichtiges Popover: ein Button, der ein schwebendes Panel öffnet.
 * Schließt bei Klick nach außen und mit Escape. Inhalt wird als children
 * übergeben (kann serverseitig gerendert sein).
 */
export function Popover({
  label,
  icon,
  children,
  width = "w-80",
}: {
  label: string;
  icon?: IconName;
  children: ReactNode;
  /** Tailwind-Breitenklasse des Panels (z. B. "w-80", "w-96"). */
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
      >
        {icon && <Icon name={icon} size={16} className="text-slate-500" />}
        {label}
        <Icon
          name="chevron"
          size={14}
          className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="dialog"
          className={`absolute right-0 z-50 mt-2 ${width} max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
