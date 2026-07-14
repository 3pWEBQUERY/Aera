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
  labels: PlanCardLabels;
  /** Call-to-action rendered at the bottom (full width). */
  children?: React.ReactNode;
}) {
  const emphasized = featured || current;
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl bg-white p-6 transition",
        emphasized
          ? "shadow-lg shadow-[var(--brand-ring)] ring-2 ring-[var(--brand)]"
          : "border border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
      )}
    >
      {/* Status pill */}
      {current ? (
        <span className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-[var(--brand)] px-2.5 py-0.5 text-[11px] font-semibold text-white">
          <Icon name="check" size={12} />
          {labels.current}
        </span>
      ) : featured ? (
        <span className="absolute right-5 top-5 inline-flex items-center rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
          {labels.popular}
        </span>
      ) : null}

      <div>
        <h3 className="text-lg font-bold text-slate-900">{name}</h3>
        <p className="mt-0.5 text-sm text-slate-500">{tagline}</p>
      </div>

      <div className="mt-5 flex items-baseline gap-1.5">
        {priceCents > 0 ? (
          <>
            <span className="text-4xl font-bold tracking-tight text-slate-900">
              {formatPrice(priceCents, "eur", labels.locale)}
            </span>
            <span className="text-sm font-medium text-slate-400">{labels.perMonth}</span>
          </>
        ) : (
          <span className="text-4xl font-bold tracking-tight text-slate-900">{labels.free}</span>
        )}
      </div>

      <div className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg bg-[var(--brand-soft)] px-2.5 py-1 text-sm font-semibold text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
        <Icon name="bolt" size={14} />
        {labels.credits}
      </div>

      <div className="my-5 h-px bg-slate-100" />

      <ul className="space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[color:var(--brand)]">
              <Icon name="check" size={11} />
            </span>
            {f}
          </li>
        ))}
      </ul>

      {children && <div className="mt-6 pt-1">{children}</div>}
    </div>
  );
}
