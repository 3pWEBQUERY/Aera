"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import type { PageData } from "./types";

/**
 * Die Steuerung des Stapels.
 *
 * Das Wischen selbst macht CSS: der Stapel ist ein waagerechter Container mit
 * `scroll-snap`, jede Karte ein Kind über die volle Breite. Das ist keine
 * Sparsamkeit, sondern die bessere Mechanik — Schwung, Gummiband am Rand und
 * die Trägheit des Fingers hat der Browser schon, und zwar auf jedem Gerät
 * richtig. Eine nachgebaute Wischgeste fühlt sich immer nach Nachbau an.
 *
 * Diese Komponente macht deshalb nur die vier Dinge, die CSS nicht kann:
 *
 *   die Reiterleiste hervorheben, während man wischt,
 *   auf einen Reiter springen,
 *   die Adresse mitführen, damit ein geteilter Link die Karte trifft,
 *   und Pfeiltasten.
 *
 * Ohne JavaScript bleibt alles davon aus — und der Stapel funktioniert
 * trotzdem: die Karten liegen im HTML, man kann waagerecht scrollen, und jede
 * Karte hat ihre eigene Adresse, die serverseitig ausgeliefert wird.
 */
export function Deck({
  page,
  scrollerId,
  liveUrl,
}: {
  page: PageData;
  /** Das Element mit den Karten. Es wird vom Server gerendert, nicht hier. */
  scrollerId: string;
  /**
   * Die öffentliche Basisadresse. Leer in der Vorschau — dort soll die Leiste
   * arbeiten, aber die Adresse des Studios nicht anfassen.
   */
  liveUrl: string | null;
}) {
  const [active, setActive] = useState(page.activeCardIndex);
  const scrollerRef = useRef<HTMLElement | null>(null);

  // Im Studio wechselt man die Karte ueber die Adresse (`?karte=shop`). Next
  // rendert die Vorschau dann neu, ohne diese Komponente auszutauschen — der
  // Zustand bliebe also auf der alten Karte stehen, waehrend der Stapel schon
  // auf der neuen steht. Sich darauf zu verlassen, dass gleich ein
  // Scroll-Ereignis das geraderueckt, waere eine Wette: ein sofortiger Sprung
  // feuert keins, wenn er nichts bewegt.
  const [seen, setSeen] = useState(page.activeCardIndex);
  if (seen !== page.activeCardIndex) {
    setSeen(page.activeCardIndex);
    setActive(page.activeCardIndex);
  }
  // Beim Klick auf einen Reiter läuft der Scroll noch, während `scroll`-
  // Ereignisse feuern. Ohne diese Sperre zappelte die Markierung über alle
  // Karten dazwischen.
  const jumpingTo = useRef<number | null>(null);

  useEffect(() => {
    const scroller = document.getElementById(scrollerId);
    if (!scroller) return;
    scrollerRef.current = scroller;

    // Ein Tiefenlink: der Server weiß, welche Karte gemeint ist, aber der
    // Stapel steht immer links. Ohne Animation, damit es wie geladen aussieht
    // und nicht wie gesprungen.
    if (page.activeCardIndex > 0) {
      scroller.scrollTo({ left: scroller.clientWidth * page.activeCardIndex, behavior: "instant" });
    }

    let frame = 0;
    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const width = scroller!.clientWidth || 1;
        const index = Math.round(scroller!.scrollLeft / width);
        if (jumpingTo.current !== null && jumpingTo.current !== index) return;
        jumpingTo.current = null;
        setActive((was) => (was === index ? was : index));
      });
    }

    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollerId, page.activeCardIndex]);

  // Die Adresse folgt dem Finger. `replaceState`, nicht `pushState`: sonst
  // wäre der Zurück-Knopf nach fünf Wischern fünfmal derselbe Stapel.
  useEffect(() => {
    if (!liveUrl) return;
    const card = page.cards[active];
    if (!card) return;
    const target = active === 0 ? liveUrl : `${liveUrl}/${card.slug}`;
    if (window.location.pathname !== new URL(target, window.location.origin).pathname) {
      window.history.replaceState(null, "", target);
    }
  }, [active, liveUrl, page.cards]);

  function go(index: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    jumpingTo.current = index;
    setActive(index);
    scroller.scrollTo({
      left: scroller.clientWidth * index,
      // Wer Bewegung abbestellt hat, bekommt den Sprung. Ein sanfter Scroll
      // über die volle Breite ist genau die Art Bewegung, die gemeint ist.
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  if (page.cards.length < 2) return null;

  return (
    <nav
      aria-label="Karten"
      className="aeli-deck-tabs"
      onKeyDown={(event) => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        const next = active + step;
        if (next < 0 || next >= page.cards.length) return;
        event.preventDefault();
        go(next);
      }}
    >
      <div className="aeli-deck-tabs-rail">
        {page.cards.map((card, index) => (
          <button
            key={card.id}
            type="button"
            onClick={() => go(index)}
            aria-current={index === active ? "true" : undefined}
            // Jeder Reiter trägt die Farben SEINER Karte, nicht die der
            // gerade sichtbaren. Man sieht der Leiste damit an, wohin man
            // springt — bei einem Stapel mit verschiedenen Designs ist das
            // die halbe Orientierung.
            style={
              {
                "--tab-accent": card.theme.accent,
                "--tab-accent-fg": card.theme.accentFg,
              } as React.CSSProperties
            }
            className="aeli-deck-tab"
          >
            <Icon name={card.icon} className="size-[1.05em]" />
            {card.title}
          </button>
        ))}
      </div>
    </nav>
  );
}
