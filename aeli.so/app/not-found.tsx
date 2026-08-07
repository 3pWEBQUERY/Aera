import Link from "next/link";
import { BrandLink } from "@/components/brand";

/**
 * Die 404 der App. Für einen unbekannten Handle gibt es eine eigene, die
 * stattdessen den freien Namen anbietet (app/p/[handle]/not-found.tsx).
 */
export default function NotFound() {
  return (
    <div className="min-h-dvh">
      <header className="px-6 py-6">
        <BrandLink />
      </header>
      <main className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
        <p className="font-mono text-sm text-signal">404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Diese Seite gibt es nicht</h1>
        <p className="mt-2 max-w-sm text-sm text-ash">
          Vielleicht ein alter Link, vielleicht ein Tippfehler.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-11 items-center rounded-xl border border-line px-5 text-sm font-medium text-chalk transition-colors hover:border-ash/50"
        >
          Zur Startseite
        </Link>
      </main>
    </div>
  );
}
