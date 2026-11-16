"use client";

import { RouteError } from "@/components/ui/route-error";

/**
 * Oberste Fehlergrenze. Laeuft innerhalb des Root-Layouts — Sprache und
 * Texte kommen also wie ueberall aus next-intl. Faellt das Root-Layout selbst
 * aus, greift app/global-error.tsx.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} fullscreen />;
}
