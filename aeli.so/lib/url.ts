import { env } from "./env";

/**
 * Die oeffentliche Adresse eines Profils.
 *
 * In Produktion ist das `https://{handle}.aeli.so`. Lokal gibt es keine
 * Subdomains, also faellt alles auf `/{app}/p/{handle}` zurueck — dieselbe
 * Seite, andere Adresse. Wichtig ist nur, dass es genau EINE Funktion gibt,
 * die das entscheidet: sonst stehen im QR-Code, in der OG-Karte und im
 * Teilen-Dialog drei verschiedene Adressen.
 */
export function profileUrl(handle: string): string {
  const root = env.AELI_ROOT_DOMAIN;
  if (!root || root === "localhost" || !root.includes(".")) {
    return `${env.AELI_APP_URL}/p/${handle}`;
  }
  return `https://${handle}.${root}`;
}

/** Wie die Adresse in der Oberflaeche steht — ohne Schema, das liest sich besser. */
export function profileUrlLabel(handle: string): string {
  return profileUrl(handle).replace(/^https?:\/\//, "");
}

/** Absolute URL auf dem Aeli-Apex (Mails, Canonicals, Weiterleitungen). */
export function appUrl(path = "/"): string {
  return `${env.AELI_APP_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Adresse einer Aera-Community. Spiegelt Aeras `tenantPublicUrl()`: eigene
 * Domain schlaegt Subdomain schlaegt Pfad.
 */
export function communityUrl(tenant: {
  slug: string;
  subdomain?: string | null;
  customDomain?: string | null;
}): string {
  if (tenant.customDomain) return `https://${tenant.customDomain}`;
  const root = env.AERA_ROOT_DOMAIN;
  if (root && root !== "localhost" && root.includes(".")) {
    return `https://${tenant.subdomain || tenant.slug}.${root}`;
  }
  return `${env.AERA_APP_URL}/c/${tenant.slug}`;
}

/**
 * Sicheres Ziel fuer einen Link-Block.
 *
 * Ein Creator tippt „instagram.com/marie“ und meint https. Zugelassen sind
 * ausserdem `mailto:` und `tel:` — alles andere, insbesondere `javascript:`
 * und `data:`, waere ein Skript im Klickziel und wird verworfen.
 */
export function normalizeExternalUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol === "mailto:" || url.protocol === "tel:") return url.toString();
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Ein Ziel ohne Punkt im Host ist kein oeffentliches Ziel, sondern ein Tippfehler
  // („localhost“, „intranet“) — und im schlimmsten Fall ein Griff ins interne Netz.
  if (!url.hostname.includes(".")) return null;

  return url.toString();
}

/** Nur der Host einer Herkunft — Pfade tragen fremde Nutzerdaten. */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}
