"use client";

import { useEffect } from "react";

/**
 * Zählt Aufrufe und Klicks — und sonst nichts.
 *
 * Zwei Entscheidungen stecken darin:
 *
 * 1. Die Links selbst bleiben ganz normale `<a>`-Elemente, serverseitig
 *    gerendert. Dieses Bauteil hört nur zu (ein einziger Listener am
 *    Dokument). Ohne JavaScript funktioniert die Seite dadurch vollständig,
 *    sie zählt eben nicht mit — die richtige Reihenfolge der Prioritäten.
 *
 * 2. `sendBeacon` statt `fetch`: der Browser stellt die Anfrage zu, auch wenn
 *    die Seite im selben Moment verlassen wird. Ein `fetch` im Klick-Handler
 *    wird beim Verlassen abgebrochen, und genau der Klick ist der, den man
 *    zählen will.
 */
export function PageTracker({ profileId }: { profileId: string }) {
  useEffect(() => {
    const send = (payload: Record<string, unknown>) => {
      const body = JSON.stringify({ profileId, ...payload });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
          return;
        }
      } catch {
        /* sendBeacon kann in strengen Kontexten werfen — dann eben fetch. */
      }
      void fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    };

    send({ kind: "VIEW" });

    const onClick = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>("[data-aeli-block]");
      const blockId = target?.dataset.aeliBlock;
      if (!blockId) return;
      send({ kind: "CLICK", blockId });
    };

    // In der Capture-Phase, damit der Klick auch dann ankommt, wenn ein
    // anderer Handler die Weitergabe stoppt.
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [profileId]);

  return null;
}
