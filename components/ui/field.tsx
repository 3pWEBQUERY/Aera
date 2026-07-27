import { cn } from "@/lib/utils";

export function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-slate-700"
    >
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]",
        props.className,
      )}
    />
  );
}

export function Textarea({
  ref,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** React 19 reicht ref als normale Prop durch — gebraucht z. B. von der
      Emoji-Auswahl, die an der Einfuegemarke schreibt. */
  ref?: React.Ref<HTMLTextAreaElement>;
}) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={cn(
        "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]",
        props.className,
      )}
    />
  );
}

// Custom, app-styled select (never the native browser/system dropdown).
export { Select } from "./select";
