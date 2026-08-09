/**
 * Zentraler Zugriff auf die Umgebung.
 *
 * Aeli laeuft neben Aera auf derselben Datenbank, aber als eigener Prozess mit
 * eigener Domain. Alles, was beide Apps teilen (DATABASE_URL, S3), heisst hier
 * deshalb genauso wie dort — wer beide Services konfiguriert, soll nicht zwei
 * Namen fuer denselben Wert pflegen. Alles, was Aeli allein gehoert, traegt das
 * Praefix `AELI_`.
 */

function requiredInProduction(name: string, value: string, minLength = 0): string {
  if (process.env.NODE_ENV === "production" && value.length < Math.max(1, minLength)) {
    throw new Error(
      minLength > 1
        ? `${name} muss in Produktion gesetzt sein (mindestens ${minLength} Zeichen). Erzeugen mit: openssl rand -base64 48`
        : `${name} muss in Produktion gesetzt sein.`,
    );
  }
  return value;
}

/** Host ohne Schema, Port und Pfad — so, wie ein Cookie ihn braucht. */
function hostOnly(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[/:].*$/, "")
    .toLowerCase();
}

const authSecret = (() => {
  // Ein eigenes Geheimnis, absichtlich. Aeli-Sessions duerfen keine
  // Aera-Sessions sein: die beiden Produkte haben verschiedene Oberflaechen,
  // verschiedene Rechte und verschiedene Angriffsflaechen. Faellt eines aus,
  // soll das andere nicht mitfallen. Wer keinen eigenen Wert setzt, bekommt in
  // der Entwicklung einen offensichtlich unsicheren.
  const secret = (process.env.AELI_AUTH_SECRET ?? "").trim();
  if (process.env.NODE_ENV === "production") {
    return requiredInProduction("AELI_AUTH_SECRET", secret, 32);
  }
  return secret || "dev-insecure-aeli-secret-please-replace-with-something-random-0001";
})();

const visitorSalt = (() => {
  // Aus User-Agent + Tag + diesem Salz entsteht der `visitorHash`. Ohne Salz
  // waere der Hash ratbar (die Menge der User-Agents ist klein), mit Salz ist
  // er es nicht. Er rotiert taeglich, weil "wie viele verschiedene Leute heute"
  // die einzige Frage ist, die wir damit beantworten wollen.
  const salt = (process.env.AELI_VISITOR_SALT ?? "").trim();
  if (process.env.NODE_ENV === "production") {
    return requiredInProduction("AELI_VISITOR_SALT", salt, 16);
  }
  return salt || "dev-visitor-salt";
})();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  AELI_AUTH_SECRET: authSecret,
  AELI_VISITOR_SALT: visitorSalt,

  /** `aeli.so` — Wurzel fuer Cookie-Scope und `{handle}.aeli.so`. */
  AELI_ROOT_DOMAIN: hostOnly(process.env.NEXT_PUBLIC_AELI_ROOT_DOMAIN ?? "localhost"),
  /** Absolute Basis fuer Mails, OG-Bilder und Canonicals. */
  AELI_APP_URL: (process.env.AELI_APP_URL ?? "http://localhost:3001").replace(/\/+$/, ""),

  /** Fuer die Bruecke: wohin ein „Community beitreten“ zeigt. */
  AERA_ROOT_DOMAIN: hostOnly(process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost"),
  AERA_APP_URL: (process.env.AERA_APP_URL ?? "http://localhost:3000").replace(/\/+$/, ""),

  /**
   * Der Bucket im Railway-Projekt „Aeli.so" — ein eigener, nicht der von Aera.
   * Die Werte kommen aus `railway bucket credentials --bucket <name> --json`.
   */
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "",
  S3_REGION: process.env.S3_REGION ?? "auto",
  S3_BUCKET: process.env.S3_BUCKET ?? "",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? "",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? "",
  /**
   * „virtual-host" oder „path". Railway meldet den passenden Stil pro Bucket;
   * der falsche liefert 404 auf jedes Objekt, deshalb wird er nicht geraten.
   */
  S3_URL_STYLE: (process.env.S3_URL_STYLE ?? "virtual-host").trim().toLowerCase(),
  /**
   * Nur setzen, wenn der Bucket oeffentlich lesbar ist oder ein CDN davor
   * steht. Leer heisst: Bilder gehen ueber `/api/media/...` — der Weg, der
   * auch mit einem privaten Bucket funktioniert (Railway-Standard).
   */
  S3_PUBLIC_URL: (process.env.S3_PUBLIC_URL ?? "").replace(/\/+$/, ""),

  /**
   * Stripe — DIESELBE Plattform wie Aera, deshalb derselbe Variablenname.
   *
   * Das ist keine Sparsamkeit, sondern die Voraussetzung: eine Bio-Seite darf
   * das Auszahlungskonto ihrer Aera-Community mitbenutzen, und eine
   * `acct_…`-Kennung gilt nur innerhalb der Plattform, die sie angelegt hat.
   * Zwei Stripe-Konten hiessen: zwei Onboardings fuer denselben Creator.
   */
  STRIPE_SECRET_KEY: (process.env.STRIPE_SECRET_KEY ?? "").trim(),
  /**
   * Eigener Endpunkt, eigenes Geheimnis. Aeras Webhook hoert auf andere
   * Ereignisse und wuerde die Aeli-Zahlungen weder kennen noch verbuchen;
   * ein geteiltes Secret wuerde nur verdecken, dass es zwei Empfaenger sind.
   */
  AELI_STRIPE_WEBHOOK_SECRET: (process.env.AELI_STRIPE_WEBHOOK_SECRET ?? "").trim(),
  /**
   * Anteil, den die Plattform vom Trinkgeld einbehaelt. Aeras Voreinstellung
   * ist dieselbe Zahl (`Tenant.platformFeePercent`), aber es ist bewusst eine
   * eigene: die Vereinbarung zwischen Aera und einer Community ist nicht die
   * Vereinbarung zwischen Aeli und einer Bio-Seite.
   */
  AELI_PLATFORM_FEE_PERCENT: clampPercent(process.env.AELI_PLATFORM_FEE_PERCENT, 5),
} as const;

/** Ein Prozentsatz, der keiner ist, waere hier eine falsche Abrechnung. */
function clampPercent(raw: string | undefined, fallback: number): number {
  const value = Number.parseFloat((raw ?? "").trim());
  if (!Number.isFinite(value) || value < 0 || value > 100) return fallback;
  return value;
}

/**
 * Ohne Schluessel keine Zahlungen. Der Trinkgeld-Baustein faellt dann auf das
 * zurueck, was er vorher war: ein Link auf eine fremde Spendenseite.
 */
export function paymentsConfigured(): boolean {
  return env.STRIPE_SECRET_KEY.startsWith("sk_");
}

/** Uploads brauchen alle vier Werte — sonst bleibt der Bild-Upload aus. */
export function storageConfigured(): boolean {
  return Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
}
