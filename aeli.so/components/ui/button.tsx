import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Drei Tonlagen, mehr braucht die App nicht.
 *
 *   signal  — die eine Handlung, die auf dieser Seite zählt. Höchstens eine.
 *   ghost   — alles Nebensächliche: Abbrechen, Zurück, Umschalten.
 *   danger  — Löschen. Rot, damit es nicht aus Versehen passiert.
 *
 * Mehr Varianten hieße, dass die Oberfläche die Wichtigkeit nicht mehr
 * entscheidet, sondern beschreibt.
 */
export type ButtonTone = "signal" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const TONE: Record<ButtonTone, string> = {
  signal:
    "bg-signal text-ink hover:bg-signal-deep disabled:bg-line disabled:text-ash shadow-[0_12px_30px_-18px] shadow-signal/80",
  ghost:
    "bg-ink-3 text-chalk border border-line hover:bg-line hover:border-ash/40 disabled:text-ash",
  danger:
    "bg-transparent text-ember border border-ember/40 hover:bg-ember/10 disabled:text-ash disabled:border-line",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[0.8125rem] rounded-lg gap-1.5",
  md: "h-11 px-5 text-sm rounded-xl gap-2",
  lg: "h-13 px-7 text-base rounded-2xl gap-2.5",
};

const BASE =
  "inline-flex items-center justify-center font-semibold whitespace-nowrap transition-[background-color,border-color,transform,color] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0 motion-reduce:active:translate-y-0";

export function buttonClass(tone: ButtonTone = "signal", size: ButtonSize = "md", extra = ""): string {
  return `${BASE} ${TONE[tone]} ${SIZE[size]} ${extra}`.trim();
}

export function Button({
  tone = "signal",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { tone?: ButtonTone; size?: ButtonSize }) {
  return <button {...props} className={buttonClass(tone, size, className)} />;
}

export function ButtonLink({
  tone = "signal",
  size = "md",
  className = "",
  children,
  ...props
}: ComponentProps<typeof Link> & { tone?: ButtonTone; size?: ButtonSize; children: ReactNode }) {
  return (
    <Link {...props} className={buttonClass(tone, size, className)}>
      {children}
    </Link>
  );
}
