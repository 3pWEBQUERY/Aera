import { ProfilePage } from "@/components/page/profile-page";
import { PUBLIC_STRINGS } from "@/lib/public-strings";
import type { PageData } from "@/components/page/types";

/**
 * Die Bühne, auf der die Seite steht.
 *
 * Vorher schwebte hier ein Telefonrahmen im Leeren, darunter eine graue
 * Bildunterschrift. Das sah aus wie ein Platzhalter, der es in die
 * Auslieferung geschafft hat.
 *
 * Jetzt ist es eine Bühne: eine eigene Fläche mit Lichtschein hinter dem
 * Gerät, eine Kopfzeile mit der echten Adresse und dem Zustand, und darunter
 * der Weg nach draußen. Die drei Dinge, die man hier wissen will — wie sieht
 * sie aus, wo liegt sie, ist das schon veröffentlicht — stehen damit
 * beieinander statt verteilt über die Seite.
 */
const SCREEN_WIDTH = 390;
/** Nur der obere Ausschnitt — gescrollt wird darin. */
const SCREEN_HEIGHT = 640;
/** Die Gehaeusekante, zweimal. Sie zaehlt bei `border-box` zur Breite. */
const BEZEL = 16;

export function PreviewStage({
  page,
  url,
  urlLabel,
  published,
  dirty,
  width = 300,
}: {
  page: PageData;
  url: string;
  urlLabel: string;
  published: boolean;
  /** Gibt es ungespeicherte Änderungen? Steuert nur die Beschriftung. */
  dirty: boolean;
  width?: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-ink-2">
      {/* Der Lichtschein hinter dem Gerät. Er hebt das Telefon von der Fläche
          ab, ohne einen Schlagschatten zu behaupten, den es bei einer
          Bildschirmvorschau nicht gibt. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-signal/10 blur-[80px]"
      />

      <header className="relative flex items-center gap-2 border-b border-line px-4 py-3">
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${published ? "bg-signal" : "bg-ash"}`}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] text-ash">{urlLabel}</span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${
            dirty
              ? "border-signal/40 text-signal"
              : published
                ? "border-line text-ash"
                : "border-line text-ash"
          }`}
        >
          {dirty ? "ungespeichert" : published ? "live" : "Entwurf"}
        </span>
      </header>

      <div className="relative flex justify-center px-6 pt-6">
        {/* Kein unterer Rand: das Gerät läuft unten aus dem Bild heraus, wie es
            ein echtes Telefon auf einem Tisch auch täte. Das spart die Höhe,
            die eine vollständige Kontur bräuchte, ohne dass etwas fehlt. */}
        <div className="aeli-phone-top" style={{ width }}>
          <div
            className="aeli-phone-screen"
            style={
              {
                "--phone-zoom": (width - BEZEL) / SCREEN_WIDTH,
                "--phone-screen-h": `${SCREEN_HEIGHT}px`,
              } as React.CSSProperties
            }
          >
            <ProfilePage page={page} mode="preview" strings={PUBLIC_STRINGS.de} />
          </div>
        </div>
      </div>

      <footer className="relative flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
        <p className="text-[0.7rem] text-ash">Vorschau · echte Seite, echte Bausteine</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg px-2 py-1 text-[0.7rem] font-medium text-chalk transition-colors hover:text-signal"
        >
          Öffnen ↗
        </a>
      </footer>
    </div>
  );
}
