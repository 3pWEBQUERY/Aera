import { Icon } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils";

export interface PlanCardLabels {
  locale: string;
  current: string;
  popular: string;
  perMonth: string;
  free: string;
  /** Already-interpolated "{n} credits / month" string. */
  credits: string;
}

/**
 * Shared, presentational plan card used on the public pricing page and inside
 * the in-app "Credits & Nutzung" popover. No client hooks — the caller passes
 * the call-to-action (a link or an action button) via `children`.
 */
export function PlanCard({
  name,
  tagline,
  priceCents,
  features,
  featured = false,
  current = false,
  compact = false,
  labels,
  children,
}: {
  name: string;
  tagline: string;
  priceCents: number;
  features: string[];
  /** Visual highlight ("Beliebt"). */
  featured?: boolean;
  /** In the popover: this is the tenant's active plan. */
  current?: boolean;
  /** Tighter responsive layout used by the two-up in-app plan slider. */
  compact?: boolean;
  labels: PlanCardLabels;
  /** Call-to-action rendered at the bottom (full width). */
  children?: React.ReactNode;
}) {
  const emphasized = featured || current;
  const statusPill = current ? (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-[var(--brand)] font-semibold text-white",
        compact
          ? "px-2 py-0.5 text-[9px] sm:px-2.5 sm:text-[11px]"
          : "absolute right-5 top-5 px-2.5 py-0.5 text-[11px]",
      )}
    >
      <Icon name="check" size={compact ? 10 : 12} />
      {labels.current}
    </span>
  ) : featured ? (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-[var(--brand-soft)] font-bold uppercase tracking-wide text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]",
        compact
          ? "px-2 py-0.5 text-[9px] sm:px-2.5 sm:text-[11px]"
          : "absolute right-5 top-5 px-2.5 py-0.5 text-[11px]",
      )}
    >
      {labels.popular}
    </span>
  ) : null;

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col rounded-2xl bg-white transition",
        compact ? "p-3.5 sm:p-6" : "p-6",
        emphasized
          ? "shadow-lg shadow-[var(--brand-ring)] ring-2 ring-[var(--brand)]"
          : "border border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
      )}
    >
      {/* Status pill */}
      {compact ? <div className="mb-2 flex min-h-5 items-center">{statusPill}</div> : statusPill}

      <div className={cn(compact && "min-h-[3.25rem] sm:min-h-0")}>
        <h3 className={cn("font-bold text-slate-900", compact ? "text-base sm:text-lg" : "text-lg")}>{name}</h3>
        <p className={cn("mt-0.5 text-slate-500", compact ? "text-xs sm:text-sm" : "text-sm")}>{tagline}</p>
      </div>

      <div className={cn("flex flex-wrap items-baseline gap-1.5", compact ? "mt-3 sm:mt-5" : "mt-5")}>
        {priceCents > 0 ? (
          <>
            <span className={cn("font-bold tracking-tight text-slate-900", compact ? "text-2xl sm:text-4xl" : "text-4xl")}>
              {formatPrice(priceCents, "eur", labels.locale)}
            </span>
            <span className={cn("font-medium text-slate-400", compact ? "text-[10px] sm:text-sm" : "text-sm")}>{labels.perMonth}</span>
          </>
        ) : (
          <span className={cn("font-bold tracking-tight text-slate-900", compact ? "text-2xl sm:text-4xl" : "text-4xl")}>{labels.free}</span>
        )}
      </div>

      <div className={cn("inline-flex w-fit items-center gap-1.5 rounded-lg bg-[var(--brand-soft)] font-semibold text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]", compact ? "mt-3 px-2 py-1 text-[11px] sm:mt-4 sm:px-2.5 sm:text-sm" : "mt-4 px-2.5 py-1 text-sm")}>
        <Icon name="bolt" size={compact ? 12 : 14} />
        {labels.credits}
      </div>

      <div className={cn("h-px bg-slate-100", compact ? "my-4 sm:my-5" : "my-5")} />

      <ul className={cn(compact ? "space-y-2 sm:space-y-2.5" : "space-y-2.5")}>
        {features.map((f) => (
          <li key={f} className={cn("flex items-start text-slate-600", compact ? "gap-1.5 text-xs sm:gap-2.5 sm:text-sm" : "gap-2.5 text-sm")}>
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[color:var(--brand)]">
              <Icon name="check" size={11} />
            </span>
            {f}
          </li>
        ))}
      </ul>

      {children && <div className={cn("mt-auto", compact ? "pt-5 sm:pt-7" : "pt-7")}>{children}</div>}
    </div>
  );
}
