import { resolveTheme, type AeliTheme } from "@/lib/themes";

/**
 * Die Miniatur einer Seite.
 *
 * Vorher standen hier zwei Farbbalken auf einem Rechteck. Das war kein Bild
 * der Seite, sondern ein Farbmuster — man sah, dass „Neon" grün ist, und nicht,
 * dass es kantige Umriss-Knöpfe in Monospace hat. Genau die Unterschiede sucht
 * man aber, wenn man einen Look aussucht.
 *
 * Diese Miniatur zeigt dieselbe Komposition wie die echte Seite: Hintergrund,
 * Avatar, Name, drei Knöpfe — in der richtigen Knopfform, dem richtigen
 * Eckenradius und der richtigen Schrift. Kein Screenshot, sondern dieselben
 * aufgelösten Werte, aus denen auch die Seite gebaut wird; sie kann also nicht
 * veralten.
 *
 * Alle Maße stehen in `cqw` — Prozent der eigenen Breite. Dadurch stimmen die
 * Proportionen in jeder Größe: dieselbe Komponente trägt die 150-px-Kachel im
 * Studio und die 90-px-Kachel im Onboarding, ohne zweite Zahlenreihe.
 */
export function ThemeThumbnail({
  theme,
  className = "",
}: {
  theme: AeliTheme;
  className?: string;
}) {
  const resolved = resolveTheme(theme);
  const image = resolved.backgroundImage;

  // Der Eckenradius wird mitverkleinert: eine 18-px-Rundung sähe auf einem
  // 6 Pixel hohen Knopf aus wie eine Pille und damit nach einem anderen Look.
  const radius =
    resolved.radius === "999px" ? "999px" : `${Math.max(0.5, parseInt(resolved.radius, 10) * 0.28)}px`;

  const button = (() => {
    switch (resolved.effectiveButtonStyle) {
      case "outline":
        return { background: "transparent", border: `1px solid ${resolved.fg}` };
      case "soft":
      case "glass":
        return { background: resolved.surface, border: `1px solid ${resolved.border}` };
      default:
        return { background: resolved.accent };
    }
  })();

  return (
    <span
      aria-hidden
      className={`relative block aspect-[4/5] overflow-hidden [container-type:inline-size] ${className}`}
      style={{ background: resolved.backgroundCss }}
    >
      {image && (
        <>
          <span
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${JSON.stringify(image.url)})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              // Die Unschärfe wird mitskaliert — 20 px auf einer 150-px-Kachel
              // wären eine graue Fläche statt einer Vorschau.
              filter: image.blur ? `blur(${Math.max(1, image.blur * 0.22)}px)` : undefined,
              transform: image.blur ? "scale(1.15)" : undefined,
            }}
          />
          {image.dim > 0 && (
            <span className="absolute inset-0 bg-black" style={{ opacity: image.dim }} />
          )}
        </>
      )}

      <span
        className="absolute inset-0 flex flex-col items-center"
        style={{ paddingInline: "14cqw", paddingTop: "16cqw", gap: "5cqw" }}
      >
        {/* Avatar — quadratisch über die Breite, damit daraus wirklich ein
            Kreis wird und keine Pille. */}
        <span
          className="aspect-square rounded-full"
          style={{ width: "26cqw", background: resolved.accent }}
        />
        {/* Name */}
        <span
          className="rounded-full"
          style={{ width: "48cqw", height: "3.5cqw", background: resolved.fg, opacity: 0.85 }}
        />
        {/* Drei Knöpfe in der Form des Looks — drei, weil eine Bio-Seite selten
            aus zweien besteht und die Wiederholung die Form erst zeigt. */}
        <span className="mt-auto flex w-full flex-col" style={{ gap: "4cqw", paddingBottom: "12cqw" }}>
          {[1, 0.85, 0.7].map((opacity) => (
            <span
              key={opacity}
              className="w-full"
              style={{ height: "9cqw", borderRadius: radius, opacity, ...button }}
            />
          ))}
        </span>
      </span>
    </span>
  );
}
