import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "brand";
type Size = "sm" | "md" | "lg";

// `--brand` defaults to Aera-violet and is overridden per tenant in the
// community layout, so primary buttons automatically follow the whitelabel.
// Auf den Aera-eigenen Seiten, die die Tinte als Markenfarbe fahren, setzt
// AERA_INK_VARS zusaetzlich `--cta-*` — dort ist der gefuellte Button ein
// Aktionsbutton und traegt die Aktionsfarbe statt der Tinte.
const filled =
  "bg-[var(--cta-bg,var(--brand))] text-[var(--cta-fg,#fff)] " +
  "hover:bg-[var(--cta-hover,var(--brand-hover))]";
const variants: Record<Variant, string> = {
  primary: filled,
  brand: filled,
  secondary: "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};
const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] " +
  "focus-visible:ring-offset-2";

interface BaseProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: BaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        base,
        "disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  href,
  ...props
}: BaseProps & { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </Link>
  );
}
