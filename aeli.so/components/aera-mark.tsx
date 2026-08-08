/**
 * Aeras App-Icon.
 *
 * Quelle: `Logo Final Files/App Icons/SVG/Asset 134.svg`, unverändert bis auf
 * eine Übersetzung, die sein muss: die Originaldatei färbt über ein `<style>`
 * mit den Klassennamen `.cls-1` und `.cls-2`. Inline in einer Seite wäre das
 * kein lokales Stylesheet, sondern ein globales — zwei generische Namen, die
 * sich mit allem beißen, was sonst noch so heißt. Hier stehen die Farben
 * deshalb als Attribute am Pfad.
 *
 * Die beiden Polygone sind unter einem Tausendstel der Zeichenfläche breit und
 * bei keiner realistischen Größe sichtbar. Sie bleiben trotzdem drin: eine
 * Markendatei kürzt man nicht heimlich, nur weil man den Unterschied nicht
 * sieht.
 *
 * Das Zeichen trägt seine eigenen Farben — `#111` für die Kachel, `#d8cfef`
 * für die Form. Es gehört Aera, nicht Aeli, und genau das soll man sehen.
 */
export function AeraMark({
  className = "",
  title = "Aera",
}: {
  className?: string;
  /** Leer lassen macht das Zeichen dekorativ — dann sagt es niemandem etwas. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 638.04 638.04"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <rect width="638.04" height="638.04" rx="116.26" ry="116.26" fill="#111" />
      <path
        fill="#d8cfef"
        d="M456.99,331.32h-109.79s122.3,167.03,122.3,167.03h91.76c-10.76,38.26-45.93,66.32-87.65,66.32H164.4c-50.28,0-91.02-40.77-91.02-91.03V164.4c0-50.26,40.75-91.02,91.03-91.02h309.22c50.28,0,91.05,40.77,91.05,91.03v83.03s-107.28-107.34-107.28-107.34l-.04.04-.35.37v-.73s-210.5,0-210.5,0l-129.67,136.46v222.13S434.99,163.56,434.99,163.56l22-23.06v190.83Z"
      />
      <polygon fill="#111" points="391.59 94.71 391.54 94.76 391.08 95.25 391.08 94.19 391.59 94.71" />
      <polygon fill="#111" points="392.02 94.28 391.59 94.71 391.54 94.76 391.08 95.25 391.08 94.28 392.02 94.28" />
    </svg>
  );
}
