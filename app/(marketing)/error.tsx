"use client";

import { RouteError } from "@/components/ui/route-error";

/**
 * Fehler auf einer Marketing-Seite (z. B. /hilfe ohne Datenbank): Kopfzeile
 * und Fusszeile bleiben stehen, nur der Inhalt wird ersetzt.
 */
export default function MarketingError({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} />;
}
