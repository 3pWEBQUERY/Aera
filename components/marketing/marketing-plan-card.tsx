import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils";

export interface MarketingPlanLabels {
  locale: string;
  popular: string;
  perMonth: string;
  /** Already-interpolated "{n} credits / month" string. */
  credits: string;
  /** Already-interpolated "{n} GB media storage" string. */
  storage: string;
}

/**
 * Plan card for the public pricing page in the editorial marketing design.
 * (The in-app credits popover keeps the separate, neutral PlanCard.)
 * Featured plan renders as a dark card; the CTA comes in via `children`.
 */
export function MarketingPlanCard({
  name,
  tagline,
  priceCents,
  features,
  featured = false,
  labels,
  children,
}: {
  name: string;
  tagline: string;
  priceCents: number;
  features: string[];
  featured?: boolean;
  labels: MarketingPlanLabels;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1",
        featured
          ? "bg-[#161613] text-white"
          : "border border-[#161613]/10 bg-white text-[#161613]",
      )}
    >
      {featured && (
        <span className="absolute right-5 top-5 inline-flex items-center rounded-full bg-[#ece7dc] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#161613]">
          {labels.popular}
        </span>
      )}

      <div>
        <h3 className="display-serif text-2xl leading-none">{name}</h3>
        <p
          className={cn(
            "mt-2 text-sm",
            featured ? "text-white/60" : "text-[#161613]/60",
          )}
        >
          {tagline}
        </p>
      </div>

      <div className="mt-6 flex items-baseline gap-2">
        <span className="display-serif text-4xl leading-none">
          {priceCents > 0 ? formatPrice(priceCents, "eur", labels.locale) : "0 €"}
        </span>
        <span
          className={cn(
            "text-sm font-medium",
            featured ? "text-white/50" : "text-[#161613]/50",
          )}
        >
          {labels.perMonth}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {[labels.credits, labels.storage].map((chip) => (
          <span
            key={chip}
            className={cn(
              "inline-flex w-fit items-center rounded-full border px-3.5 py-1.5 text-sm font-semibold",
              featured
                ? "border-white/25 text-white/85"
                : "border-[#161613]/20 text-[#161613]/80",
            )}
          >
            {chip}
          </span>
        ))}
      </div>

      <div
        className={cn(
          "my-6 h-px",
          featured ? "bg-white/15" : "bg-[#161613]/10",
        )}
      />

      <ul className="flex-1 space-y-3">
        {features.map((f) => (
          <li
            key={f}
            className={cn(
              "flex items-start gap-3 text-sm leading-6",
              featured ? "text-white/75" : "text-[#161613]/70",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full",
                featured ? "bg-[#ece7dc]" : "bg-[#161613]",
              )}
            />
            {f}
          </li>
        ))}
      </ul>

      {children && <div className="mt-7">{children}</div>}
    </div>
  );
}
