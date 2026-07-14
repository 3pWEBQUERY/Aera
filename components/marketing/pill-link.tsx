import Link from "next/link";

const tones = {
  light: "bg-white text-[#161613] hover:bg-[#ece7dc]",
  dark: "bg-[#161613] text-white hover:bg-[#33332e]",
  "outline-light":
    "border border-white/30 text-white hover:border-white/70 hover:bg-white/5",
  "outline-dark":
    "border border-[#161613]/25 text-[#161613] hover:border-[#161613]/60 hover:bg-[#161613]/5",
} as const;

export type PillTone = keyof typeof tones;

/** Pill-shaped CTA link for the marketing pages (Patreon-like). */
export function PillLink({
  href,
  children,
  tone = "dark",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  tone?: PillTone;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-12 items-center justify-center rounded-full px-7 text-base font-semibold transition-colors duration-200 ${tones[tone]} ${className}`}
    >
      {children}
    </Link>
  );
}
