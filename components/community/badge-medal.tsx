import { Icon } from "@/components/dashboard/icons";
import { TIER_COLORS, type BadgeLook } from "@/lib/badges";

/**
 * Eine gezeichnete Auszeichnung: Form, Metall, Zeichen.
 *
 * Alles ist SVG mit Verlaeufen — kein Bildmaterial. Das bleibt in jeder
 * Groesse scharf, laesst sich vom Creator zusammenstellen und faerbt sich bei
 * der Stufe "Marke" mit der Primaerfarbe der Community.
 *
 * Die vier Formen sind bewusst unterschiedlich in der Silhouette (Kreis,
 * Kreis mit Band, Sechseck, Zackenrand): auf 28 Pixel in einer Mitgliederliste
 * erkennt man sie dann noch auseinander, wo eine Farbnuance laengst untergeht.
 */
export function BadgeMedal({
  look,
  size = 48,
  title,
  className,
}: {
  look: BadgeLook;
  size?: number;
  title?: string;
  className?: string;
}) {
  const c = TIER_COLORS[look.tier];
  const id = `${look.tier}-${look.shape}`.toLowerCase();
  // Das Band haengt unter der Plakette: die Zeichenflaeche ist hoeher als breit.
  const withRibbon = look.shape === "MEDAL";
  const h = withRibbon ? size * 1.28 : size;
  const glyph = Math.round(size * 0.42);

  return (
    <span
      className={className}
      style={{ display: "inline-block", width: size, height: h, lineHeight: 0 }}
      title={title}
    >
      <svg width={size} height={h} viewBox={`0 0 100 ${withRibbon ? 128 : 100}`} role="img" aria-label={title}>
        <defs>
          <linearGradient id={`bm-face-${id}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor={c.light} />
            <stop offset="55%" stopColor={c.base} />
            <stop offset="100%" stopColor={c.dark} />
          </linearGradient>
          <linearGradient id={`bm-rim-${id}`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor={c.rim} />
            <stop offset="60%" stopColor={c.base} />
            <stop offset="100%" stopColor={c.dark} />
          </linearGradient>
        </defs>

        {withRibbon && (
          <>
            {/* Band zuerst, damit die Plakette darauf liegt. */}
            <path d="M32 62h36v56l-18-14-18 14Z" fill={c.dark} />
            <path d="M38 62h24v46l-12-9-12 9Z" fill={c.base} opacity="0.85" />
          </>
        )}

        <g>
          {look.shape === "HEX" ? (
            <>
              <path d="M50 4 88 26v48L50 96 12 74V26Z" fill={`url(#bm-rim-${id})`} />
              <path d="M50 14 79 31v38L50 86 21 69V31Z" fill={`url(#bm-face-${id})`} />
            </>
          ) : look.shape === "SEAL" ? (
            <>
              <path d={sealPath(50, 50, 46, 38, 16)} fill={`url(#bm-rim-${id})`} />
              <circle cx="50" cy="50" r="35" fill={`url(#bm-face-${id})`} />
            </>
          ) : (
            <>
              <circle cx="50" cy="50" r="46" fill={`url(#bm-rim-${id})`} />
              <circle cx="50" cy="50" r="37" fill={`url(#bm-face-${id})`} />
            </>
          )}

          {/* Lichtkante oben links — gibt der Flaeche Woelbung. */}
          <path
            d="M50 13a37 37 0 0 0-33 20 37 37 0 0 1 66 0A37 37 0 0 0 50 13Z"
            fill="#fff"
            opacity="0.28"
          />
        </g>

        <g transform={`translate(${50 - glyph / 2} ${50 - glyph / 2}) scale(${glyph / 24})`}>
          <Icon name={look.icon} size={24} stroke={c.ink} strokeWidth={2} />
        </g>
      </svg>
    </span>
  );
}

/**
 * Zackenrand einer Siegel-Plakette. Wird gerechnet statt gezeichnet, damit
 * die Zacken bei jeder Zahl gleichmaessig sitzen.
 */
function sealPath(cx: number, cy: number, outer: number, inner: number, teeth: number): string {
  const points: string[] = [];
  const steps = teeth * 2;
  for (let i = 0; i < steps; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * 2 * i) / steps - Math.PI / 2;
    points.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}
