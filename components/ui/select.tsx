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

  return (
    <div ref={ref} className={cn("relative", className)}>
      {name && (
        <input type="hidden" name={name} value={selected} required={required} />
      )}
      <button
        type="button"
        id={fieldId}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm outline-none transition",
          open
            ? "border-[var(--brand)] ring-2 ring-[var(--brand-ring)]"
            : "border-slate-300 hover:border-slate-400",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className={cn("truncate", !selectedOpt && "text-slate-400")}>
          {selectedOpt?.label ?? placeholder ?? "Auswählen"}
        </span>
        <Icon
          name="chevron"
          size={16}
          className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
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
                    i === active ? "bg-slate-100" : "",
                    isSel ? "font-medium text-slate-900" : "text-slate-600",
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
