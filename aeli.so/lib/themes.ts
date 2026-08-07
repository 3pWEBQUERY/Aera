/**
 * Aeli-Themes.
 *
 * Die Entscheidung dahinter: lieber acht Looks, die jemand entworfen hat, als
 * zweihundert Vorlagen, die sich nur in der Kopfzeile unterscheiden. Jedes
 * Preset traegt eine eigene Haltung — Farbe, Typografie, Kantenradius,
 * Hintergrundstimmung und Button-Form gehoeren zusammen und werden deshalb
 * gemeinsam gesetzt, nicht einzeln zusammengeklickt.
 *
 * Feintuning gibt es trotzdem: Akzentfarbe, Rundung, Button-Form und
 * Schriftpaar lassen sich ueber das Preset legen. Was fehlt, ist Absicht —
 * eine frei waehlbare Hintergrundfarbe erzeugt vor allem unlesbare Seiten.
 */

export type ButtonStyle = "solid" | "outline" | "soft" | "glass";
export type Corner = "sharp" | "soft" | "round" | "pill";
export type Backdrop = "none" | "aurora" | "grain" | "mesh" | "rings";
export type FontPairKey = keyof typeof FONT_PAIRS;
export type ThemePresetKey = (typeof THEME_PRESETS)[number]["key"];

/**
 * Der Hintergrund ist ein eigenes Objekt, keine Farbe.
 *
 * Die erste Fassung hatte hier ein einzelnes Feld — und war damit genau so
 * weit, wie man mit einem einzelnen Feld kommt. Ein Creator will aber nicht
 * „eine von acht Farben", sondern seinen Verlauf, sein Foto, seine Fläche.
 * Als markierte Union lässt sich das erweitern, ohne dass die bestehenden
 * Seiten etwas davon merken: `kind: "preset"` ist der Zustand, in dem alle
 * bisherigen Profile sind.
 */
export type GradientStyle = "linear" | "radial" | "conic";

export interface GradientStop {
  color: string;
  /** Position auf der Achse, 0–100. */
  at: number;
}

export type Background =
  /** Nimmt, was das Preset mitbringt. Der Ausgangszustand. */
  | { kind: "preset" }
  | { kind: "solid"; color: string }
  | { kind: "gradient"; style: GradientStyle; angle: number; stops: GradientStop[] }
  | {
      kind: "image";
      url: string;
      /** Weichzeichnen in Pixeln — ein Foto hinter Text braucht das fast immer. */
      blur: number;
      /** Abdunkeln von 0 bis 1. Der zweite Hebel für Lesbarkeit. */
      dim: number;
    };

/** Helle oder dunkle Schrift auf dem Hintergrund. `auto` rechnet es aus. */
export type TextTone = "auto" | "light" | "dark";

export interface AeliTheme {
  preset: ThemePresetKey;
  accent?: string;
  buttonStyle?: ButtonStyle;
  corner?: Corner;
  fontPair?: FontPairKey;
  backdrop?: Backdrop;
  background?: Background;
  textTone?: TextTone;
}

/**
 * Schriftpaare als reine Systemstacks — kein Webfont, keine zweite Anfrage,
 * kein Textsprung beim Laden. Eine Bio-Seite wird zu 80 % vom Handy aus
 * geoeffnet, oft im mobilen Netz; die halbe Sekunde, die ein Webfont kostet,
 * ist genau die halbe Sekunde, in der Leute wieder weg sind.
 *
 * Die Stacks sind bewusst NICHT Inter: `system-ui` sieht auf jedem Geraet nach
 * dem Geraet aus, die Serifen- und Mono-Paare nach einer Entscheidung.
 */
export const FONT_PAIRS = {
  grotesk: {
    label: "Grotesk",
    display: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`,
    body: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`,
  },
  editorial: {
    label: "Editorial",
    display: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif`,
    body: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  },
  klassik: {
    label: "Klassik",
    display: `Georgia, "Iowan Old Style", "Times New Roman", serif`,
    body: `Georgia, "Iowan Old Style", "Times New Roman", serif`,
  },
  technisch: {
    label: "Technisch",
    display: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`,
    body: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`,
  },
  plakat: {
    label: "Plakat",
    display: `"Avenir Next Condensed", "Helvetica Neue Condensed", "Arial Narrow", system-ui, sans-serif`,
    body: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  },
} as const;

export interface ThemePreset {
  key: string;
  label: string;
  /** Ein Satz, der die Stimmung benennt — steht so in der Auswahl. */
  hint: string;
  scheme: "light" | "dark";
  bg: string;
  bgAlt: string;
  fg: string;
  muted: string;
  surface: string;
  border: string;
  accent: string;
  accentFg: string;
  fontPair: FontPairKey;
  buttonStyle: ButtonStyle;
  corner: Corner;
  backdrop: Backdrop;
}

export const THEME_PRESETS = [
  {
    key: "mitternacht",
    label: "Mitternacht",
    hint: "Tiefes Blau, das sich langsam bewegt.",
    scheme: "dark",
    bg: "#080b18",
    bgAlt: "#111634",
    fg: "#f2f4ff",
    muted: "#9aa3c7",
    surface: "#151a35",
    border: "#262d52",
    accent: "#7c6bff",
    accentFg: "#ffffff",
    fontPair: "grotesk",
    buttonStyle: "solid",
    corner: "round",
    backdrop: "aurora",
  },
  {
    key: "papier",
    label: "Papier",
    hint: "Warmes Weiss, Serifen, feine Linien.",
    scheme: "light",
    bg: "#faf7f0",
    bgAlt: "#f2ece0",
    fg: "#1c1a16",
    muted: "#6f6a5e",
    surface: "#ffffff",
    border: "#e2dbcb",
    accent: "#1c1a16",
    accentFg: "#faf7f0",
    fontPair: "editorial",
    buttonStyle: "outline",
    corner: "soft",
    backdrop: "grain",
  },
  {
    key: "sonnenaufgang",
    label: "Sonnenaufgang",
    hint: "Pfirsich in Rose, dunkle Pflaume darauf.",
    scheme: "light",
    bg: "#fff1e6",
    bgAlt: "#ffd9e0",
    fg: "#3d1f38",
    muted: "#8a5f78",
    surface: "#ffffffcc",
    border: "#f3c9d4",
    accent: "#e0407a",
    accentFg: "#ffffff",
    fontPair: "grotesk",
    buttonStyle: "glass",
    corner: "pill",
    backdrop: "mesh",
  },
  {
    key: "neon",
    label: "Neon",
    hint: "Schwarz, Monospace, ein einziges grelles Gruen.",
    scheme: "dark",
    bg: "#050505",
    bgAlt: "#0d0d0d",
    fg: "#eaffea",
    muted: "#7d917d",
    surface: "#0f120f",
    border: "#1f2a1f",
    accent: "#39ff6a",
    accentFg: "#04160a",
    fontPair: "technisch",
    buttonStyle: "outline",
    corner: "sharp",
    backdrop: "none",
  },
  {
    key: "wald",
    label: "Wald",
    hint: "Dunkles Gruen mit Creme — ruhig und satt.",
    scheme: "dark",
    bg: "#0f1f18",
    bgAlt: "#173026",
    fg: "#f0ece1",
    muted: "#9db2a5",
    surface: "#16291f",
    border: "#25412f",
    accent: "#d8c48b",
    accentFg: "#12241b",
    fontPair: "klassik",
    buttonStyle: "soft",
    corner: "soft",
    backdrop: "rings",
  },
  {
    key: "beton",
    label: "Beton",
    hint: "Grau, harte Kanten, ein rotes Signal.",
    scheme: "light",
    bg: "#e9e9e7",
    bgAlt: "#dcdcd8",
    fg: "#131313",
    muted: "#65655f",
    surface: "#f5f5f3",
    border: "#c9c9c4",
    accent: "#e0301e",
    accentFg: "#ffffff",
    fontPair: "plakat",
    buttonStyle: "solid",
    corner: "sharp",
    backdrop: "none",
  },
  {
    key: "perle",
    label: "Perle",
    hint: "Milchglas ueber Flieder, sehr weich.",
    scheme: "light",
    bg: "#f4f1fb",
    bgAlt: "#e7e0fb",
    fg: "#241f37",
    muted: "#6d6785",
    surface: "#ffffffb3",
    border: "#ded6f5",
    accent: "#6d4dff",
    accentFg: "#ffffff",
    fontPair: "grotesk",
    buttonStyle: "glass",
    corner: "round",
    backdrop: "mesh",
  },
  {
    key: "kohle",
    label: "Kohle",
    hint: "Anthrazit mit Orange — nuechtern, aber wach.",
    scheme: "dark",
    bg: "#151515",
    bgAlt: "#1f1f1f",
    fg: "#f0eeea",
    muted: "#9a9691",
    surface: "#1c1c1c",
    border: "#2f2f2f",
    accent: "#ff6b1a",
    accentFg: "#160b03",
    fontPair: "technisch",
    buttonStyle: "soft",
    corner: "soft",
    backdrop: "grain",
  },
] as const satisfies readonly ThemePreset[];

export const DEFAULT_THEME: AeliTheme = { preset: "mitternacht" };

/**
 * Startpunkte für den Verlaufsbaukasten.
 *
 * Nicht als geschlossene Auswahl gedacht, sondern als Anfang: jeder davon ist
 * nach einem Klick ein normaler Verlauf, an dem sich Farben, Winkel und Anzahl
 * der Stopps weiter verstellen lassen. Vor dem leeren Farbwähler zu sitzen ist
 * der zuverlässigste Weg, gar keinen Verlauf zu bauen.
 */
export const GRADIENT_PRESETS: { label: string; value: Extract<Background, { kind: "gradient" }> }[] = [
  {
    label: "Dämmerung",
    value: { kind: "gradient", style: "linear", angle: 160, stops: [
      { color: "#2b1055", at: 0 }, { color: "#7597de", at: 100 },
    ] },
  },
  {
    label: "Mango",
    value: { kind: "gradient", style: "linear", angle: 135, stops: [
      { color: "#ff8f36", at: 0 }, { color: "#ff3d68", at: 100 },
    ] },
  },
  {
    label: "Tiefsee",
    value: { kind: "gradient", style: "linear", angle: 180, stops: [
      { color: "#020917", at: 0 }, { color: "#0b3d5c", at: 60 }, { color: "#1ea7a0", at: 100 },
    ] },
  },
  {
    label: "Salbei",
    value: { kind: "gradient", style: "linear", angle: 150, stops: [
      { color: "#dfe9d8", at: 0 }, { color: "#8fae8b", at: 100 },
    ] },
  },
  {
    label: "Halogen",
    value: { kind: "gradient", style: "radial", angle: 0, stops: [
      { color: "#3a2fb0", at: 0 }, { color: "#08080f", at: 100 },
    ] },
  },
  {
    label: "Sorbet",
    value: { kind: "gradient", style: "linear", angle: 120, stops: [
      { color: "#ffd6a5", at: 0 }, { color: "#ffadad", at: 50 }, { color: "#bdb2ff", at: 100 },
    ] },
  },
  {
    label: "Prisma",
    value: { kind: "gradient", style: "conic", angle: 210, stops: [
      { color: "#ff6b6b", at: 0 }, { color: "#4ecdc4", at: 40 }, { color: "#5b6cff", at: 75 }, { color: "#ff6b6b", at: 100 },
    ] },
  },
  {
    label: "Beton",
    value: { kind: "gradient", style: "linear", angle: 200, stops: [
      { color: "#f2f2f0", at: 0 }, { color: "#c9c9c4", at: 100 },
    ] },
  },
];

const CORNER_RADIUS: Record<Corner, string> = {
  sharp: "0px",
  soft: "10px",
  round: "18px",
  pill: "999px",
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Nur echte Hex-Werte ueberleben. Die Theme-Werte landen als CSS-Variablen in
 * einem inline `<style>`; ein ungeprueftes Feld waere damit eine offene Tuer
 * fuer fremde Deklarationen auf der Seite.
 */
function safeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!HEX.test(trimmed)) return null;
  // Kurzschreibweise ausschreiben: `#fff` und `#ffffff` sind dieselbe Farbe,
  // sollen aber auch dieselbe gespeicherte Zeichenkette sein. Sonst meldet der
  // „ungespeichert"-Vergleich einen Unterschied, wo keiner ist — und ein
  // `<input type="color">` liefert ohnehin immer sechs Stellen.
  return trimmed.length === 4
    ? `#${trimmed.slice(1).split("").map((c) => c + c).join("")}`
    : trimmed;
}

function isKeyOf<T extends object>(record: T, value: unknown): value is keyof T {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(record, value);
}

export function findPreset(key: unknown): ThemePreset {
  return (
    THEME_PRESETS.find((preset) => preset.key === key) ??
    THEME_PRESETS.find((preset) => preset.key === DEFAULT_THEME.preset)!
  );
}

/**
 * Nimmt, was in `AeliProfile.theme` steht — also alles, auch Unsinn — und gibt
 * ein gueltiges Theme zurueck. Es gibt keinen Fehlerfall: eine Bio-Seite darf
 * nie wegen eines krummen Feldes weiss bleiben.
 */
export function parseTheme(raw: unknown): AeliTheme {
  const input = (raw ?? {}) as Record<string, unknown>;
  const preset = findPreset(input.preset);
  return {
    preset: preset.key as ThemePresetKey,
    accent: safeHex(input.accent) ?? undefined,
    buttonStyle: (["solid", "outline", "soft", "glass"] as const).find((s) => s === input.buttonStyle),
    corner: (["sharp", "soft", "round", "pill"] as const).find((c) => c === input.corner),
    fontPair: isKeyOf(FONT_PAIRS, input.fontPair) ? input.fontPair : undefined,
    backdrop: (["none", "aurora", "grain", "mesh", "rings"] as const).find((b) => b === input.backdrop),
    background: parseBackground(input.background),
    textTone: (["auto", "light", "dark"] as const).find((t) => t === input.textTone),
  };
}

/** Zahl in Grenzen, mit Rückfallwert — Json-Spalten enthalten irgendwann alles. */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * Der Hintergrund aus der Json-Spalte. Alles, was nicht vollständig aufgeht,
 * fällt auf `preset` zurück — die Seite bekommt dann den Look, den sie vorher
 * hatte, statt einer weißen Fläche.
 */
export function parseBackground(raw: unknown): Background | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Record<string, unknown>;

  switch (input.kind) {
    case "preset":
      return { kind: "preset" };

    case "solid": {
      const color = safeHex(input.color);
      return color ? { kind: "solid", color } : undefined;
    }

    case "gradient": {
      const stops = Array.isArray(input.stops)
        ? input.stops
            .map((stop) => {
              const entry = (stop ?? {}) as Record<string, unknown>;
              const color = safeHex(entry.color);
              return color ? { color, at: clampNumber(entry.at, 0, 100, 50) } : null;
            })
            .filter((stop): stop is GradientStop => stop !== null)
            // Sechs Stopps sind mehr, als eine Fläche verträgt — und mehr, als
            // die Bedienung sinnvoll zeigen kann.
            .slice(0, 6)
        : [];
      if (stops.length < 2) return undefined;
      return {
        kind: "gradient",
        style: (["linear", "radial", "conic"] as const).find((s) => s === input.style) ?? "linear",
        angle: Math.round(clampNumber(input.angle, 0, 360, 160)),
        stops: [...stops].sort((a, b) => a.at - b.at),
      };
    }

    case "image": {
      const url = typeof input.url === "string" ? input.url.trim().slice(0, 2000) : "";
      // Nur eigene Bilder und https — ein Hintergrund aus `javascript:` oder
      // `data:` hätte auf einer fremden Seite nichts verloren.
      if (!url || !(url.startsWith("/api/media/") || url.startsWith("https://"))) return undefined;
      return {
        kind: "image",
        url,
        blur: Math.round(clampNumber(input.blur, 0, 40, 0)),
        dim: Math.round(clampNumber(input.dim, 0, 0.85, 0.35) * 100) / 100,
      };
    }

    default:
      return undefined;
  }
}

/**
 * Ein Fingerabdruck, der nur vom INHALT abhängt, nicht von der Schlüsselfolge.
 *
 * Gebraucht für den „ungespeichert"-Hinweis im Studio: der Vergleich läuft
 * gegen den Stand, der vom Server kam, und dort baut `parseTheme` die Felder in
 * seiner eigenen Reihenfolge auf. Ein direkter `JSON.stringify`-Vergleich wäre
 * deshalb nach dem ersten Speichern dauerhaft „ungleich" — der Hinweis stünde
 * für immer da und würde dadurch bedeutungslos.
 */
export function themeFingerprint(theme: AeliTheme): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, entry]) => entry !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, canonical(entry)]),
      );
    }
    return value;
  };
  return JSON.stringify(canonical(theme));
}

export interface ResolvedTheme extends ThemePreset {
  radius: string;
  fontDisplay: string;
  fontBody: string;
  effectiveButtonStyle: ButtonStyle;
  effectiveBackdrop: Backdrop;
  /** Fertiger CSS-Wert für die Hintergrundfläche (Farbe, Verlauf oder Bild). */
  backgroundCss: string;
  /** Nur bei einem Bildhintergrund gesetzt — die Ebene wird dann eigens gebaut. */
  backgroundImage: { url: string; blur: number; dim: number } | null;
  /** Liegt helle Schrift auf der Fläche? Steuert auch die Backdrop-Deckkraft. */
  isDark: boolean;
}

/** Relative Leuchtdichte nach WCAG. Basis für jede Kontrastentscheidung hier. */
function luminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized;
  const channel = (offset: number) => {
    const value = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Der CSS-Wert eines Verlaufs. */
export function gradientCss(background: Extract<Background, { kind: "gradient" }>): string {
  const stops = background.stops.map((stop) => `${stop.color} ${stop.at}%`).join(", ");
  switch (background.style) {
    case "radial":
      // `farthest-corner` statt der Voreinstellung: sonst endet der Verlauf auf
      // hohen Seiten vor dem unteren Rand und lässt einen harten Streifen übrig.
      return `radial-gradient(farthest-corner at 50% 30%, ${stops})`;
    case "conic":
      return `conic-gradient(from ${background.angle}deg at 50% 40%, ${stops})`;
    default:
      return `linear-gradient(${background.angle}deg, ${stops})`;
  }
}

/**
 * Die eine Farbe, die eine Fläche „im Mittel" hat — Grundlage dafür, ob helle
 * oder dunkle Schrift darauf gehört. Bei einem Verlauf ist das der Mittelwert
 * seiner Stopps: grob, aber für die Ja/Nein-Frage genau genug.
 */
function baseColorOf(background: Background, preset: ThemePreset): string {
  if (background.kind === "solid") return background.color;
  if (background.kind === "gradient") {
    const sum = background.stops.reduce(
      (acc, stop) => {
        const hex = stop.color.replace("#", "");
        const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
        acc.r += parseInt(full.slice(0, 2), 16);
        acc.g += parseInt(full.slice(2, 4), 16);
        acc.b += parseInt(full.slice(4, 6), 16);
        return acc;
      },
      { r: 0, g: 0, b: 0 },
    );
    const n = background.stops.length;
    const hex = (value: number) => Math.round(value / n).toString(16).padStart(2, "0");
    return `#${hex(sum.r)}${hex(sum.g)}${hex(sum.b)}`;
  }
  return preset.bg;
}

/** Preset + Feintuning zu genau den Werten, die die Seite braucht. */
export function resolveTheme(theme: AeliTheme): ResolvedTheme {
  const preset = findPreset(theme.preset);
  const fonts = FONT_PAIRS[theme.fontPair ?? preset.fontPair];
  const corner = theme.corner ?? preset.corner;
  const background = theme.background ?? { kind: "preset" };

  const base = { ...preset };

  if (background.kind !== "preset") {
    // Ein eigener Hintergrund zieht die übrigen Flächenfarben mit. Sonst
    // stünde die Karte eines dunklen Presets auf einem hellen Foto — und die
    // Schrift wäre weiß auf weiß. Das ist der Preis dafür, dass hier alles
    // erlaubt ist: die Lesbarkeit wird berechnet, nicht dem Zufall überlassen.
    const isDark =
      theme.textTone === "light"
        ? true
        : theme.textTone === "dark"
          ? false
          : background.kind === "image"
            // Ein Foto kann alles sein. Helle Schrift plus Abdunklung ist die
            // Kombination, die auf den meisten Bildern funktioniert.
            ? true
            : luminance(baseColorOf(background, preset)) < 0.45;

    base.fg = isDark ? "#f7f7f5" : "#141414";
    base.muted = isDark ? "rgba(247,247,245,0.66)" : "rgba(20,20,20,0.62)";
    base.surface = isDark ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.72)";
    base.border = isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.10)";
    base.scheme = isDark ? "dark" : "light";
    base.bg = baseColorOf(background, preset);
    base.bgAlt = base.bg;
  }

  const isDark = base.scheme === "dark";

  return {
    ...base,
    accent: theme.accent ?? preset.accent,
    // Der Akzenttext wird nicht mitgewaehlt, sondern berechnet: wer eine helle
    // Akzentfarbe setzt, bekommt dunkle Schrift darauf statt weiss auf gelb.
    accentFg: theme.accent ? readableOn(theme.accent) : preset.accentFg,
    radius: CORNER_RADIUS[corner],
    fontDisplay: fonts.display,
    fontBody: fonts.body,
    effectiveButtonStyle: theme.buttonStyle ?? preset.buttonStyle,
    effectiveBackdrop: theme.backdrop ?? preset.backdrop,
    backgroundCss:
      background.kind === "solid"
        ? background.color
        : background.kind === "gradient"
          ? gradientCss(background)
          : preset.bg,
    backgroundImage:
      background.kind === "image"
        ? { url: background.url, blur: background.blur, dim: background.dim }
        : null,
    isDark,
  };
}

/**
 * Schwarz oder Weiss auf der gegebenen Farbe — je nachdem, was sich besser
 * liest. Relative Leuchtdichte nach WCAG, Schwelle bei 0,5; das trifft die
 * Entscheidung fuer die kritischen Faelle (Gelb, Cyan, Limette) richtig, wo
 * eine reine Helligkeitsrechnung daneben liegt.
 */
export function readableOn(hex: string): string {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized.split("").map((c) => c + c).join("")
      : normalized;
  const channel = (offset: number) => {
    const value = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.42 ? "#111111" : "#ffffff";
}

/**
 * Die CSS-Variablen einer Seite. Bewusst ein String und kein Objekt: er wird
 * einmal in ein `<style>` gerendert und gilt dann fuer Server- wie
 * Client-Teile der Seite gleichermassen.
 */
export function themeStyleVars(theme: ResolvedTheme): Record<string, string> {
  return {
    "--aeli-bg": theme.bg,
    "--aeli-bg-alt": theme.bgAlt,
    // Die eigentliche Fläche. `--aeli-bg` bleibt die EINE Farbe darunter —
    // sie wird für Ränder und Überlappungen gebraucht, wo ein Verlauf nicht
    // weiterhilft (etwa der Ring um den Avatar).
    "--aeli-bg-css": theme.backgroundCss,
    "--aeli-fg": theme.fg,
    "--aeli-muted": theme.muted,
    "--aeli-surface": theme.surface,
    "--aeli-border": theme.border,
    "--aeli-accent": theme.accent,
    "--aeli-accent-fg": theme.accentFg,
    "--aeli-radius": theme.radius,
    "--aeli-font-display": theme.fontDisplay,
    "--aeli-font-body": theme.fontBody,
  };
}
