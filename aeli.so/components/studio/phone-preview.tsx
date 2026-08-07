import { ProfilePage } from "@/components/page/profile-page";
import { PUBLIC_STRINGS } from "@/lib/public-strings";
import type { PageData } from "@/components/page/types";

/**
 * Die Vorschau.
 *
 * Sie rendert exakt dieselbe Komponente wie die echte Seite — kein Nachbau,
 * keine zweite Wahrheit. Der einzige Unterschied ist `mode="preview"`: Klicks
 * werden nicht gezählt, Formulare senden nicht.
 *
 * Kein iframe. Ein iframe bräuchte eine eigene Route, eine eigene Anfrage und
 * einen eigenen Ladezustand — und würde beim Tippen im Theme-Panel jedes Mal
 * neu laden, statt sich einfach mitzuverändern.
 *
 * Der Bildschirm ist innen 390 px breit und wird auf `width` heruntergezoomt.
 * Würde man ihn stattdessen einfach schmal rendern, zeigte die Vorschau
 * Zeilenumbrüche und gekürzte Titel, die es auf einem echten Handy nicht gibt
 * — und der Creator würde Texte kürzen, die gar nicht zu lang sind.
 */
const SCREEN_WIDTH = 390;
/** Die Gehaeusekante, zweimal — sie zaehlt bei `border-box` zur Breite. */
const BEZEL = 16;

export function PhonePreview({
  page,
  label,
  width = 320,
}: {
  page: PageData;
  label?: string;
  width?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="aeli-phone" style={{ width }}>
        <div className="aeli-phone-screen" style={{ "--phone-zoom": (width - BEZEL) / SCREEN_WIDTH } as React.CSSProperties}>
          <ProfilePage page={page} mode="preview" strings={PUBLIC_STRINGS.de} />
        </div>
      </div>
      {label && <p className="text-xs text-ash">{label}</p>}
    </div>
  );
}
