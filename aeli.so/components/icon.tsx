/**
 * Die Zeichen von Aeli — einer für alles.
 *
 * Vorher gab es zwei Sprachen: Emoji an den Bausteinen, Strichzeichen an den
 * Kartenreitern. Nebeneinander sah das aus wie zwei Produkte. Ein Emoji bringt
 * außerdem drei Eigenschaften mit, die in einem Knopf stören — es sieht auf
 * jedem System anders aus, hat eine eigene Farbe, die zur Akzentfarbe des
 * Themes nicht passt, und steht auf einer anderen Grundlinie als der Text
 * daneben.
 *
 * Also ein Satz für beides: 50 Zeichen auf demselben 24er Raster, Strich 1.6,
 * runde Enden, `currentColor`. Sie nehmen die Farbe an, in der sie stehen —
 * hell auf dunkel, dunkel auf hell, akzentfarben auf einem vollflächigen
 * Knopf — ohne dass irgendwo eine Farbe gepflegt werden müsste.
 *
 * Die drei Zahlen oben sind der ganze Grund, warum der Satz zusammengehörig
 * aussieht. Wer eines ergänzt, hält sich daran.
 *
 * Alte Bausteine und Karten tragen noch ein Emoji. `Icon` gibt einen
 * unbekannten Wert deshalb als Text aus, statt ihn zu verschlucken: was einmal
 * gesetzt wurde, verschwindet nicht, weil sich die Auswahl geändert hat.
 */

export interface IconEntry {
  key: string;
  label: string;
  path: React.ReactNode;
}

export interface IconGroup {
  label: string;
  icons: IconEntry[];
}

export const ICON_GROUPS: IconGroup[] = [
  {
    label: "Basis",
    icons: [
      {
        key: "link",
        label: "Link",
        path: (
          <>
            <path d="M10.2 13.8a3.9 3.9 0 0 0 5.5 0l2.9-2.9a3.9 3.9 0 1 0-5.5-5.5l-1 1" />
            <path d="M13.8 10.2a3.9 3.9 0 0 0-5.5 0l-2.9 2.9a3.9 3.9 0 1 0 5.5 5.5l1-1" />
          </>
        ),
      },
      {
        key: "arrow",
        label: "Weiter",
        path: (
          <>
            <path d="M4.5 12h14" />
            <path d="m13 6.5 5.5 5.5L13 17.5" />
          </>
        ),
      },
      {
        key: "text",
        label: "Text",
        path: (
          <>
            <path d="M4.5 6.5h15M4.5 11h15M4.5 15.5h10M4.5 20h6" />
          </>
        ),
      },
      {
        key: "heading",
        label: "Überschrift",
        path: (
          <>
            <path d="M6 5v14M15 5v14M6 12h9" />
            <path d="M18 19V9.5l-2.4 1.4" />
          </>
        ),
      },
      {
        key: "divider",
        label: "Trenner",
        path: (
          <>
            <path d="M3.5 12h5.6M14.9 12h5.6" />
            <path d="m12 9.6 2.4 2.4-2.4 2.4-2.4-2.4z" />
          </>
        ),
      },
    ],
  },
  {
    label: "Seite",
    icons: [
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
        key: "star",
        label: "Highlights",
        path: (
          <path d="m12 3.8 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 10l5.9-.8z" />
        ),
      },
      {
        key: "sparkle",
        label: "Neu",
        path: (
          <>
            <path d="m10 3.5 1.7 4.8 4.8 1.7-4.8 1.7L10 16.5 8.3 11.7 3.5 10l4.8-1.7z" />
            <path d="m17.5 14 .9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" />
          </>
        ),
      },
      {
        key: "bookmark",
        label: "Merken",
        path: <path d="M6.5 4.5h11a1 1 0 0 1 1 1V20l-6.5-4-6.5 4V5.5a1 1 0 0 1 1-1z" />,
      },
    ],
  },
  {
    label: "Medien",
    icons: [
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
        key: "film",
        label: "Film",
        path: (
          <>
            <rect x="3" y="5" width="18" height="14" rx="2.6" />
            <path d="M8 5v14M16 5v14M3 12h18" />
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
        key: "headphones",
        label: "Kopfhörer",
        path: (
          <>
            <path d="M4.5 15v-2.6a7.5 7.5 0 0 1 15 0V15" />
            <rect x="3" y="14" width="4" height="6.5" rx="2" />
            <rect x="17" y="14" width="4" height="6.5" rx="2" />
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
    ],
  },
  {
    label: "Bild",
    icons: [
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
        label: "Bild",
        path: (
          <>
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <circle cx="8.6" cy="10" r="1.5" />
            <path d="m4 17.2 4.6-4 3 2.6 3.6-3.2L20 17" />
          </>
        ),
      },
      {
        key: "gallery",
        label: "Galerie",
        path: (
          <>
            <rect x="7" y="3.5" width="14" height="14" rx="2.6" />
            <path d="M17 20.5H5.6A2.1 2.1 0 0 1 3.5 18.4V7" />
          </>
        ),
      },
      {
        key: "palette",
        label: "Kunst",
        path: (
          <>
            <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2.1-.9 2.1-1.9 0-1.5-1.2-1.8-1.2-3 0-.9.7-1.6 1.7-1.6h1.8a4.1 4.1 0 0 0 4.1-4.1c0-3.6-3.8-6.4-8.5-6.4z" />
            <circle cx="8" cy="9.5" r="1.1" />
            <circle cx="12" cy="7.5" r="1.1" />
            <circle cx="16" cy="9.5" r="1.1" />
          </>
        ),
      },
      {
        key: "sun",
        label: "Licht",
        path: (
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.8v2.3M12 18.9v2.3M4.5 12H2.2M21.8 12h-2.3M6.7 6.7 5.1 5.1M18.9 18.9l-1.6-1.6M6.7 17.3l-1.6 1.6M18.9 5.1l-1.6 1.6" />
          </>
        ),
      },
    ],
  },
  {
    label: "Verkaufen",
    icons: [
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
        key: "tag",
        label: "Preis",
        path: (
          <>
            <path d="M4.5 11.4V5.5a1 1 0 0 1 1-1h5.9a1 1 0 0 1 .7.3l7.4 7.4a1 1 0 0 1 0 1.4l-5.9 5.9a1 1 0 0 1-1.4 0L4.8 12.1a1 1 0 0 1-.3-.7z" />
            <circle cx="8.6" cy="8.6" r="1.3" />
          </>
        ),
      },
      {
        key: "card",
        label: "Bezahlen",
        path: (
          <>
            <rect x="2.8" y="5.5" width="18.4" height="13" rx="2.6" />
            <path d="M2.8 10h18.4" />
            <path d="M6.5 14.5h3.5" />
          </>
        ),
      },
      {
        key: "gift",
        label: "Geschenk",
        path: (
          <>
            <rect x="3.5" y="8.5" width="17" height="4" rx="1" />
            <path d="M5 12.5v6.4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6.4" />
            <path d="M12 8.5v11.4" />
            <path d="M12 8.5S10.6 4 8.4 4a2.2 2.2 0 0 0 0 4.5zM12 8.5S13.4 4 15.6 4a2.2 2.2 0 0 1 0 4.5z" />
          </>
        ),
      },
      {
        key: "box",
        label: "Produkt",
        path: (
          <>
            <path d="M12 3.2 20.5 7.6v8.8L12 20.8 3.5 16.4V7.6z" />
            <path d="M3.5 7.6 12 12l8.5-4.4M12 12v8.8" />
          </>
        ),
      },
    ],
  },
  {
    label: "Schreiben",
    icons: [
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
        key: "chat",
        label: "Kontakt",
        path: (
          <path d="M20.4 12.2c0 3.8-3.7 6.8-8.2 6.8-1 0-2-.1-2.9-.4l-4.7 1.7 1.6-3.9a6.4 6.4 0 0 1-2.2-4.2c0-3.8 3.7-6.8 8.2-6.8s8.2 3 8.2 6.8z" />
        ),
      },
      {
        key: "edit",
        label: "Schreiben",
        path: (
          <>
            <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
            <path d="m14.5 6.5 3 3" />
          </>
        ),
      },
      {
        key: "document",
        label: "Dokument",
        path: (
          <>
            <path d="M6 3.5h7.5L19 9v10.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" />
            <path d="M13.2 3.6V9H19" />
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
    ],
  },
  {
    label: "Termine",
    icons: [
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
        key: "clock",
        label: "Uhrzeit",
        path: (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7v5.3l3.4 2" />
          </>
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
        key: "ticket",
        label: "Ticket",
        path: (
          <>
            <path d="M3.2 10.3V6.4a1 1 0 0 1 1-1h15.6a1 1 0 0 1 1 1v3.9a1.9 1.9 0 0 0 0 3.4v3.9a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1v-3.9a1.9 1.9 0 0 0 0-3.4z" />
            <path d="M14.6 7.6v1.8M14.6 11.1v1.8M14.6 14.6v1.8" />
          </>
        ),
      },
      {
        key: "coffee",
        label: "Pause",
        path: (
          <>
            <path d="M4 8.5h12v6.2a4.4 4.4 0 0 1-4.4 4.4H8.4A4.4 4.4 0 0 1 4 14.7z" />
            <path d="M16 10h1.8a2.6 2.6 0 0 1 0 5.2H16" />
            <path d="M7 3.5v2M11 3.5v2" />
          </>
        ),
      },
    ],
  },
  {
    label: "Menschen",
    icons: [
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
        key: "heart",
        label: "Danke",
        path: (
          <path d="M12 20.2C10.2 18.9 4.4 14.7 4.4 10.4A4 4 0 0 1 12 8.3a4 4 0 0 1 7.6 2.1c0 4.3-5.8 8.5-7.6 9.8z" />
        ),
      },
      {
        key: "join",
        label: "Beitreten",
        path: (
          <>
            <circle cx="9.6" cy="8.4" r="3.5" />
            <path d="M3 19.6c1.2-3.1 3.7-4.7 6.6-4.7 1 0 2 .2 2.9.6" />
            <path d="M17.4 13.6v6.2M14.3 16.7h6.2" />
          </>
        ),
      },
      {
        key: "wave",
        label: "Hallo",
        path: (
          <>
            <path d="M9.5 12.5V5.9a1.5 1.5 0 0 1 3 0v5.1" />
            <path d="M12.5 11V4.9a1.5 1.5 0 0 1 3 0v6.6" />
            <path d="M15.5 11.5V7.4a1.5 1.5 0 0 1 3 0v6.4a6.7 6.7 0 0 1-6.7 6.7h-.6a5.5 5.5 0 0 1-4.4-2.2l-3-4a1.5 1.5 0 0 1 2.3-1.9l2.4 2.5" />
          </>
        ),
      },
    ],
  },
  {
    label: "Lernen",
    icons: [
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
        key: "bulb",
        label: "Idee",
        path: (
          <>
            <path d="M9 17.5a6.3 6.3 0 1 1 6 0v1.9a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" />
            <path d="M9.8 20.8h4.4" />
          </>
        ),
      },
      {
        key: "chart",
        label: "Zahlen",
        path: (
          <>
            <path d="M4 20V4" />
            <path d="M4 20h16" />
            <path d="M8 16.5v-4M12.5 16.5V7.5M17 16.5v-6.5" />
          </>
        ),
      },
      {
        key: "wrench",
        label: "Werkzeug",
        path: (
          <path d="M14.8 3.6a5.6 5.6 0 0 0-5 8.1L4.3 17.2a1.9 1.9 0 0 0 2.7 2.7l5.5-5.5a5.6 5.6 0 0 0 7-7.4l-3 3-2.6-2.6 3-3a5.6 5.6 0 0 0-2.1-.8z" />
        ),
      },
      {
        key: "globe",
        label: "Web",
        path: (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M3.6 12h16.8" />
            <path d="M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5z" />
          </>
        ),
      },
    ],
  },
  {
    label: "Zeichen",
    icons: [
      { key: "bolt", label: "Live", path: <path d="M13.4 3 5.8 13.6h5.1L10 21l7.9-10.9h-5z" /> },
      {
        key: "lock",
        label: "Geschützt",
        path: (
          <>
            <rect x="4.5" y="10" width="15" height="10.2" rx="2.4" />
            <path d="M8.2 10V7.6a3.8 3.8 0 0 1 7.6 0V10" />
          </>
        ),
      },
      {
        key: "check",
        label: "Erledigt",
        path: (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="m8.2 12.2 2.6 2.6 5-5.4" />
          </>
        ),
      },
      {
        key: "qr",
        label: "QR-Code",
        path: (
          <>
            <rect x="3.8" y="3.8" width="6.4" height="6.4" rx="1.4" />
            <rect x="13.8" y="3.8" width="6.4" height="6.4" rx="1.4" />
            <rect x="3.8" y="13.8" width="6.4" height="6.4" rx="1.4" />
            <path d="M14 14h2.6v2.6H14zM17.6 17.6h2.6v2.6h-2.6z" />
          </>
        ),
      },
      {
        key: "download",
        label: "Datei",
        path: (
          <>
            <path d="M12 3.8v10.6" />
            <path d="m7.8 10.4 4.2 4.2 4.2-4.2" />
            <path d="M4.5 17.5v1.6a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.6" />
          </>
        ),
      },
    ],
  },
];

export const ICONS: IconEntry[] = ICON_GROUPS.flatMap((group) => group.icons);

const BY_KEY = new Map(ICONS.map((icon) => [icon.key, icon]));

export function isIcon(value: string): boolean {
  return BY_KEY.has(value);
}

export function iconLabel(value: string): string | null {
  return BY_KEY.get(value)?.label ?? null;
}

/**
 * Ein Zeichen.
 *
 * `null` heißt: keins. Ein unbekannter Wert ist kein Fehler, sondern ein Emoji
 * aus der Zeit vor diesem Satz — es wird als Text ausgegeben.
 */
export function Icon({
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
