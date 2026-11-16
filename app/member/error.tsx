"use client";

import { RouteError } from "@/components/ui/route-error";

/**
 * Fehler im Mitgliederkonto. /member hat kein eigenes Layout — die Grenze
 * sitzt trotzdem hier, damit ein Fehler im Konto nicht bis zur obersten
 * Grenze durchschlaegt und der Weg zur Hilfe direkt daneben steht.
 */
export default function MemberError({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} fullscreen />;
}
