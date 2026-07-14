import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";
import { Icon, type IconName } from "@/components/dashboard/icons";

export function Avatar({
  name,
  src,
  size = 36,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  // Rounded-square avatar with a radius proportional to size (~27%), so it
  // reads consistently from tiny (24px) to large (80px) — not a circle.
  const radius = Math.max(6, Math.round(size * 0.27));
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="object-cover ring-1 ring-black/5"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center bg-[var(--brand-soft)] font-semibold text-[var(--brand)] ring-1 ring-black/5"
      style={{ width: size, height: size, fontSize: size * 0.4, borderRadius: radius }}
    >
      {initials(name)}
    </div>
  );
}

export function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint?: string;
  /** Icon rendered in a soft brand-tinted badge above the title. */
  icon?: IconName;
  /** Optional CTA (button/link) rendered below the hint. */
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
      {icon && (
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
          <Icon name={icon} size={24} />
        </span>
      )}
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{hint}</p>}
      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}
