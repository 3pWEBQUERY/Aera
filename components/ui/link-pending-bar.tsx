"use client";

import { useLinkStatus } from "next/link";

/**
 * Schmaler Fortschrittsbalken oben am Fenster, solange der umgebende `<Link>`
 * navigiert (Next `useLinkStatus`). Muss innerhalb eines `<Link>` stehen.
 *
 * Gedacht fuer Ziele ohne loading.tsx — dort bliebe sonst die alte Seite
 * ohne jede Rueckmeldung stehen, bis die neue fertig ist. Rein visuell
 * (aria-hidden): Screenreader bekommen den Seitenwechsel ohnehin angesagt.
 */
export function LinkPendingBar() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className="nav-pending-bar pointer-events-none fixed inset-x-0 top-0 z-[100] block h-0.5 bg-[var(--brand)]"
    />
  );
}
