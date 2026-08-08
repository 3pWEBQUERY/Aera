/**
 * Aelis Wortmarke, hier in Aera nachgebaut.
 *
 * Quelle: `aeli.so/components/brand.tsx`. Die beiden Apps werden getrennt
 * ausgeliefert und teilen keine Komponenten — anders als bei den Handle-Regeln
 * und dem Verbindungscode gibt es dafür auch keinen Drift-Test: ein geändertes
 * Logo ist eine bewusste, sichtbare Entscheidung, kein stiller Fehler.
 *
 * Zwei Dinge muss der Nachbau mitbringen, sonst ist es nicht dasselbe Zeichen:
 *
 *  * Den Signalton `#c9f24d`. In Aeli steht er als `--color-signal` im Theme;
 *    Aeras Palette kennt ihn nicht, also steht er hier wörtlich. Er gehört zu
 *    Aeli, nicht zu Aera — ein Token dafür anzulegen würde ihn zu Aeras Farbe
 *    machen.
 *  * Die Systemschrift von Aeli. Aera setzt Inter, und Inter ist der
 *    SF-Pro-Familie nah genug, dass man es für richtig halten könnte — die
 *    tiefere x-Höhe und das andere „a“ sieht man bei vier Kleinbuchstaben
 *    trotzdem.
 *
 * Der Punkt ist die ganze Idee der Marke: eine Aeli-Seite ist ein Endpunkt.
 * Er ist `aria-hidden`, der Name daneben bleibt vorlesbar.
 */
export function AeliWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline font-semibold tracking-tight ${className}`}
      style={{
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      }}
    >
      aeli
      <span
        aria-hidden
        className="ml-[0.09em] size-[0.3em] translate-y-[-0.02em] rounded-full"
        style={{ background: "#c9f24d" }}
      />
    </span>
  );
}
