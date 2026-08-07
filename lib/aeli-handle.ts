/**
 * Die Handle-Regeln von Aeli — WORTGLEICHE Kopie von `aeli.so/lib/handle.ts`.
 *
 * Aera braucht sie, weil eine Aeli-Seite auch von hier aus angelegt werden kann
 * (Einstellungen -> Integrationen). Die beiden Apps werden getrennt
 * ausgeliefert und koennen sich keine Datei teilen; dass die Regeln nicht
 * auseinanderlaufen, sichert tests/aeli-integration.test.ts ab, der beide
 * Dateien Zeichen fuer Zeichen vergleicht. Aenderungen gehoeren nach Aeli und
 * werden von dort hierher kopiert.
 *
 * Der Handle ist gleichzeitig Adresse (`{handle}.aeli.so`), Anzeige und
 * Identitaet. Er wird einmal gewaehlt und danach selten geaendert, also lieber
 * einmal streng pruefen als spaeter kaputte Links einsammeln.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

/**
 * Labels, die niemals ein Profil sein duerfen.
 *
 * Drei Gruende stehen darin gemischt, und alle drei zaehlen:
 *  - Infrastruktur (`www`, `api`, `cdn`): wuerde echte Hosts verdecken.
 *  - Vertrauen (`login`, `admin`, `support`, `billing`): `login.aeli.so` in
 *    einer Nachricht sieht aus wie unsere Anmeldeseite. Genau so funktioniert
 *    der Betrug, gegen den diese Liste steht.
 *  - Marke (`aeli`, `aera`, `team`): gehoert uns, nicht dem schnellsten Klick.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "www", "app", "api", "admin", "administrator", "root", "system", "static", "assets", "cdn",
  "mail", "email", "smtp", "imap", "pop", "ns", "ns1", "ns2", "dns", "mx", "ftp", "ssh",
  "status", "health", "metrics", "monitor", "staging", "dev", "test", "demo", "sandbox", "preview",
  "login", "logout", "signin", "signup", "register", "auth", "oauth", "sso", "account", "accounts",
  "password", "reset", "verify", "verification", "security", "billing", "invoice", "payment",
  "pay", "checkout", "pricing", "upgrade", "pro", "premium", "plan", "plans",
  "support", "help", "helpdesk", "contact", "kontakt", "hilfe", "faq", "docs", "documentation",
  "legal", "impressum", "datenschutz", "privacy", "terms", "agb", "widerruf", "dsgvo", "gdpr",
  "aeli", "aera", "team", "official", "staff", "moderator", "mod", "brand", "press", "jobs",
  "blog", "news", "about", "home", "start", "studio", "dashboard", "settings", "analytics",
  "discover", "explore", "search", "shop", "store", "download", "downloads", "files", "share",
  "me", "my", "you", "user", "users", "profile", "profiles", "page", "pages", "link", "links",
  "null", "undefined", "true", "false", "none", "void", "example", "sample",
]);

export type HandleProblem =
  | "empty"
  | "tooShort"
  | "tooLong"
  | "charset"
  | "edges"
  | "doubleDash"
  | "numericOnly"
  | "reserved";

/**
 * Normalisiert eine Eingabe zu einem Handle-Kandidaten, ohne ihn zu pruefen.
 * Bewusst nachsichtig: wer „Marie Lang“ tippt, soll `marie-lang` vorgeschlagen
 * bekommen, statt eine Fehlermeldung zu lesen.
 */
export function normalizeHandle(input: string): string {
  return (
    input
      .toLowerCase()
      // Erst zusammensetzen (NFC), dann ausschreiben. Andersherum zerlegt NFKD
      // „ü“ vorher in „u“ + Trema, die Regel darunter greift ins Leere, und
      // aus „müller“ wird „muller“ — ein Name, den die Person nicht als ihren
      // erkennt. Genau das hatte diese Funktion zuerst getan.
      .normalize("NFC")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      // Was danach noch an Diakritika übrig ist (é, ñ, å), wird zerlegt und
      // auf den Grundbuchstaben reduziert.
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, HANDLE_MAX)
  );
}

/** `null` = in Ordnung. Sonst der erste Grund, warum nicht. */
export function checkHandle(handle: string): HandleProblem | null {
  if (!handle) return "empty";
  if (handle.length < HANDLE_MIN) return "tooShort";
  if (handle.length > HANDLE_MAX) return "tooLong";
  if (!/^[a-z0-9-]+$/.test(handle)) return "charset";
  if (handle.startsWith("-") || handle.endsWith("-")) return "edges";
  // Doppelter Bindestrich ist die Form, die Punycode fuer sich beansprucht
  // (`xn--…`). Ein Handle in dieser Form kann in der Adresszeile als voellig
  // anderer Text erscheinen — und `a--b` ist ohnehin kein Name, den jemand
  // absichtlich waehlt.
  if (handle.includes("--")) return "doubleDash";
  // Reine Zahlen sehen in der Adresszeile aus wie eine IP oder eine ID und
  // laden zum Durchprobieren ein.
  if (/^\d+$/.test(handle)) return "numericOnly";
  if (RESERVED_HANDLES.has(handle)) return "reserved";
  return null;
}

export function isValidHandle(handle: string): boolean {
  return checkHandle(handle) === null;
}

/**
 * Vorschlaege, wenn der Wunsch-Handle schon weg ist. Erst Varianten, die noch
 * wie ein Name aussehen, dann Ziffern — niemand moechte `marie-4817` heissen,
 * wenn `marie-official` frei ist.
 */
export function handleSuggestions(base: string): string[] {
  const root = normalizeHandle(base) || "seite";
  const trimmed = root.slice(0, HANDLE_MAX - 4);
  const candidates = [
    root,
    `${trimmed}-official`,
    `${trimmed}-live`,
    `hey-${trimmed}`,
    `${trimmed}1`,
    `${trimmed}2`,
    `${trimmed}7`,
  ];
  return [...new Set(candidates)].filter(isValidHandle).slice(0, 6);
}
