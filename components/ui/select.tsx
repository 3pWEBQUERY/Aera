"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/icons";

interface Opt {
  value: string;
  label: string;
}

/**
 * "field" ist das ausgewachsene Formularfeld ueber die volle Breite.
 * "pill" ist die kompakte Filterpille, wie sie reihenweise ueber Listen steht:
 * so breit wie ihr Text, rund, und mit einem Menue, das sich nach dem
 * laengsten Eintrag richtet statt nach der Pille.
 */
export type SelectVariant = "field" | "pill";

/**
 * "light" steht auf Papier oder Weiss, "dark" auf dunklem Grund — etwa im
 * Live-Studio, wo die Bedienleiste ueber dem Videobild liegt. Ein helles Feld
 * waere dort ein Loch im Bild.
 */
export type SelectTone = "light" | "dark";

export function Select({
  name,
  id,
  defaultValue,
  value: controlled,
  onChange,
  children,
  className,
  placeholder,
  disabled,
  required,
  variant = "field",
  tone = "light",
  ariaLabel,
}: {
  name?: string;
  id?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  children?: React.ReactNode;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  variant?: SelectVariant;
  tone?: SelectTone;
  /**
   * Nur noetig, wenn kein <Label> auf das Feld zeigt. Der Knopf traegt sonst
   * den gewaehlten Wert als Namen — der sagt, *was* eingestellt ist, aber
   * nicht, *wofuer*.
   */
  ariaLabel?: string;
}) {
  const options: Opt[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === "option") {
      const p = child.props as { value?: string | number; children?: React.ReactNode };
      options.push({ value: String(p.value ?? ""), label: String(p.children ?? "") });
    }
  });

  const autoId = useId();
  const fieldId = id ?? autoId;
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState<string>(
    controlled ?? defaultValue ?? options[0]?.value ?? "",
  );
  const selected = controlled ?? internal;
  const selectedOpt = options.find((o) => o.value === selected);
  const [active, setActive] = useState<number>(
    Math.max(0, options.findIndex((o) => o.value === selected)),
  );

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(v: string) {
    setInternal(v);
    onChange?.(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(options.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const opt = options[active];
        if (opt) choose(opt.value);
      }
    }
  }

  const pill = variant === "pill";
  const dark = tone === "dark";

  return (
    <div ref={ref} className={cn(pill ? "relative inline-block" : "relative", className)}>
      {/* Ein deaktiviertes Feld darf nichts senden — sonst uebertraegt das
          versteckte Input weiter einen Wert, obwohl die Bedienung gesperrt ist. */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={selected}
          required={required}
          disabled={disabled}
        />
      )}
      <button
        type="button"
        id={fieldId}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          "flex items-center justify-between gap-2 border text-left outline-none transition",
          dark ? "bg-white/10 text-white" : "bg-white",
          pill
            ? "rounded-full px-3.5 py-1.5 text-xs font-semibold hover:bg-slate-50"
            : "w-full rounded-lg px-3 py-2 text-sm",
          pill && !dark && "text-slate-600",
          open
            ? dark
              ? "border-white/40"
              : "border-[var(--brand)] ring-2 ring-[var(--brand-ring)]"
            : dark
              ? "border-white/15 hover:border-white/30"
              : "border-slate-300 hover:border-slate-400",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className={cn("truncate", !selectedOpt && (dark ? "text-white/50" : "text-slate-400"))}>
          {selectedOpt?.label ?? placeholder ?? "Auswählen"}
        </span>
        <Icon
          name="chevron"
          size={pill ? 13 : 16}
          className={cn(
            "shrink-0 transition-transform",
            dark ? "text-white/60" : "text-slate-400",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className={cn(
            "absolute z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border p-1.5 shadow-lg",
            dark ? "border-white/15 bg-[#1d1d1b]" : "border-slate-200 bg-white",
            // Eine Pille ist so schmal wie ihr Text; ein Menue in derselben
            // Breite wuerde jeden laengeren Eintrag abschneiden.
            pill ? "w-max min-w-full" : "w-full",
          )}
        >
          {options.map((o, i) => {
            const isSel = o.value === selected;
            return (
              <li key={o.value || i} role="option" aria-selected={isSel}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                    i === active ? (dark ? "bg-white/10" : "bg-slate-100") : "",
                    isSel
                      ? dark
                        ? "font-medium text-white"
                        : "font-medium text-slate-900"
                      : dark
                        ? "text-white/70"
                        : "text-slate-600",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {isSel && <Icon name="check" size={16} className="shrink-0 text-[var(--brand)]" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
