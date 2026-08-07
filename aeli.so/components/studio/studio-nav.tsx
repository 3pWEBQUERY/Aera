"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/studio", label: "Seite" },
  { href: "/studio/design", label: "Design" },
  { href: "/studio/statistik", label: "Statistik" },
  { href: "/studio/einstellungen", label: "Einstellungen" },
] as const;

/**
 * Vier Reiter, keiner mehr.
 *
 * Die Aufteilung folgt der Frage, die jemand im Kopf hat, wenn er ins Studio
 * kommt: „was steht drauf“ (Seite), „wie sieht es aus“ (Design), „funktioniert
 * es“ (Statistik), „alles andere“ (Einstellungen). Eine fünfte Kategorie hätte
 * bisher immer bedeutet, dass eine der vier unscharf geworden ist.
 */
export function StudioNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Studio">
      {TABS.map((tab) => {
        // `/studio` ist nur dann aktiv, wenn es exakt passt — sonst leuchtet
        // es auf jeder Unterseite mit.
        const active = tab.href === "/studio" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              active ? "text-chalk" : "text-ash hover:text-chalk"
            }`}
          >
            {tab.label}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-signal"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
