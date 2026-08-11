/**
 * Die Zeichen der Kartenreiter.
 *
 * Warum keine Emoji — obwohl der Baustein-Editor genau die anbietet:
 *
 * Ein Emoji am Baustein ist Inhalt. Es gehört dem Creator, steht mitten im
 * Knopf und darf bunt sein. Das Zeichen eines Reiters ist etwas anderes: es
 * gehört zur Navigation, sitzt zwölf Pixel neben einem Wort und liegt in der
 * Reiterleiste über wechselnden Hintergründen. Emoji versagen dort dreifach —
 * sie sehen auf jedem System anders aus, bringen eine eigene Farbe mit, die
 * zum Theme der Karte nicht passt, und stehen auf einer anderen Grundlinie
 * als der Text daneben.
 *
 * Also ein eigener Satz: 20 Strichzeichen auf demselben 24er Raster, dieselbe
 * Strichstärke, `currentColor`. Sie nehmen damit die Farbe des Reiters an —
 * hell auf dunkel, dunkel auf hell, akzentfarben, wenn er aktiv ist — ohne
 * dass irgendwo eine Farbe gepflegt werden müsste.
 *
 * Alte Karten tragen noch ein Emoji. `CardIcon` gibt einen unbekannten Wert
 * deshalb als Text aus, statt ihn zu verschlucken: was einmal gesetzt wurde,
 * verschwindet nicht, weil sich die Auswahl geändert hat.
 */

export interface CardIconEntry {
  key: string;
  label: string;
  path: React.ReactNode;
}

/**
 * Gezeichnet auf 24 × 24, Strich 1.6, runde Enden. Die drei Zahlen sind der
 * ganze Grund, warum der Satz zusammengehörig aussieht — wer ein Zeichen
 * ergänzt, hält sich daran.
 */
export const CARD_ICONS: CardIconEntry[] = [
  {
    key: "home",
    label: "Start",
    path: <path d="M4 10.4 12 4l8 6.4V19a1 1 0 0 1-1 1h-4.2v-5.2H9.2V20H5a1 1 0 0 1-1-1z" />,
  },
  {
    key: "grid",
    label: "Übersicht",
    path: (
      <>
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
        <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
        <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
      </>
    ),
  },
  {
    key: "link",
    label: "Links",
    path: (
      <>
        <path d="M10.2 13.8a3.9 3.9 0 0 0 5.5 0l2.9-2.9a3.9 3.9 0 1 0-5.5-5.5l-1 1" />
        <path d="M13.8 10.2a3.9 3.9 0 0 0-5.5 0l-2.9 2.9a3.9 3.9 0 1 0 5.5 5.5l1-1" />
      </>
    ),
  },
  {
    key: "user",
    label: "Über mich",
    path: (
      <>
        <circle cx="12" cy="8.2" r="3.6" />
        <path d="M5 19.6c1.3-3.2 3.9-4.8 7-4.8s5.7 1.6 7 4.8" />
      </>
    ),
  },
  {
    key: "music",
    label: "Musik",
    path: (
      <>
        <path d="M9 17.5V6.2l10-2v11.3" />
        <circle cx="6.6" cy="17.5" r="2.4" />
        <circle cx="16.6" cy="15.5" r="2.4" />
      </>
    ),
  },
  {
    key: "play",
    label: "Video",
    path: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3.5" />
        <path d="m10.2 9.2 5 2.8-5 2.8z" />
      </>
    ),
  },
  {
    key: "camera",
    label: "Foto",
    path: (
      <>
        <path d="M3 9.6a1.6 1.6 0 0 1 1.6-1.6h2.2l1.4-2h7.6l1.4 2h2.2A1.6 1.6 0 0 1 21 9.6v8.2a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.8z" />
        <circle cx="12" cy="13.2" r="3.4" />
      </>
    ),
  },
  {
    key: "image",
    label: "Galerie",
    path: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <circle cx="8.6" cy="10" r="1.5" />
        <path d="m4 17.2 4.6-4 3 2.6 3.6-3.2L20 17" />
      </>
    ),
  },
  {
    key: "bag",
    label: "Shop",
    path: (
      <>
        <path d="M5.2 8h13.6l-1.1 11.2a1 1 0 0 1-1 .8H7.3a1 1 0 0 1-1-.8z" />
        <path d="M9 8.6V6.8a3 3 0 0 1 6 0v1.8" />
      </>
    ),
  },
  {
    key: "calendar",
    label: "Termine",
    path: (
      <>
        <rect x="3.5" y="5.5" width="17" height="14.5" rx="2.6" />
        <path d="M3.5 10.2h17" />
        <path d="M8.2 3.6v3.8M15.8 3.6v3.8" />
      </>
    ),
  },
  {
    key: "mail",
    label: "Newsletter",
    path: (
      <>
        <rect x="3" y="5.8" width="18" height="12.4" rx="2.6" />
        <path d="m3.8 8.2 8.2 5.6 8.2-5.6" />
      </>
    ),
  },
  {
    key: "users",
    label: "Community",
    path: (
      <>
        <circle cx="9.4" cy="8.6" r="3.2" />
        <path d="M3.4 19.4c1-2.9 3.4-4.4 6-4.4s5 1.5 6 4.4" />
        <path d="M16.2 6.3a3.2 3.2 0 0 1 0 4.9" />
        <path d="M17.4 15.3c1.7.6 2.9 1.9 3.4 3.6" />
      </>
    ),
  },
  {
    key: "graduation",
    label: "Kurse",
    path: (
      <>
        <path d="M12 4.6 21.5 9 12 13.4 2.5 9z" />
        <path d="M6.6 11.2v4.4c0 1.7 2.4 3 5.4 3s5.4-1.3 5.4-3v-4.4" />
      </>
    ),
  },
  {
    key: "book",
    label: "Lesen",
    path: (
      <>
        <path d="M12 7.4C10.7 6.1 8.8 5.4 6 5.4H3.6v12.2H6c2.8 0 4.7.7 6 2z" />
        <path d="M12 7.4c1.3-1.3 3.2-2 6-2h2.4v12.2H18c-2.8 0-4.7.7-6 2z" />
      </>
    ),
  },
  {
    key: "mic",
    label: "Podcast",
    path: (
      <>
        <rect x="9" y="3" width="6" height="10.6" rx="3" />
        <path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0" />
        <path d="M12 17.8V21" />
      </>
    ),
  },
  {
    key: "chat",
    label: "Kontakt",
    path: (
      <path d="M20.4 12.2c0 3.8-3.7 6.8-8.2 6.8-1 0-2-.1-2.9-.4l-4.7 1.7 1.6-3.9a6.4 6.4 0 0 1-2.2-4.2c0-3.8 3.7-6.8 8.2-6.8s8.2 3 8.2 6.8z" />
    ),
  },
  {
    key: "pin",
    label: "Ort",
    path: (
      <>
        <path d="M12 20.8s6.4-6 6.4-10.4a6.4 6.4 0 1 0-12.8 0C5.6 14.8 12 20.8 12 20.8z" />
        <circle cx="12" cy="10.4" r="2.5" />
      </>
    ),
  },
  {
    key: "heart",
    label: "Danke",
    path: (
      <path d="M12 20.2C10.2 18.9 4.4 14.7 4.4 10.4A4 4 0 0 1 12 8.3a4 4 0 0 1 7.6 2.1c0 4.3-5.8 8.5-7.6 9.8z" />
    ),
  },
  {
    key: "star",
    label: "Highlights",
    path: (
      <path d="m12 3.8 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 10l5.9-.8z" />
    ),
  },
  {
    key: "bolt",
    label: "Live",
    path: <path d="M13.4 3 5.8 13.6h5.1L10 21l7.9-10.9h-5z" />,
  },
];

const BY_KEY = new Map(CARD_ICONS.map((icon) => [icon.key, icon]));

export function isCardIcon(value: string): boolean {
  return BY_KEY.has(value);
}

export function cardIconLabel(value: string): string | null {
  return BY_KEY.get(value)?.label ?? null;
}

/**
 * Das Zeichen einer Karte.
 *
 * `null` heißt: keins. Ein unbekannter Wert ist kein Fehler, sondern ein
 * Emoji aus der Zeit vor diesem Satz — es wird als Text ausgegeben.
 */
export function CardIcon({
  name,
  className = "size-[1.05em]",
}: {
  name: string | null;
  className?: string;
}) {
  if (!name) return null;

  const icon = BY_KEY.get(name);
  if (!icon) {
    return (
      <span aria-hidden className="text-[0.95em] leading-none">
        {name}
      </span>
    );
  }

  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {icon.path}
    </svg>
  );
}
