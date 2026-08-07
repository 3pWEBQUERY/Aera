import { NextRequest, NextResponse } from "next/server";
import { RESERVED_HANDLES, isValidHandle } from "@/lib/handle";

/**
 * Host-Routing.
 *
 *   aeli.so           -> Marketing, Anmeldung, Studio (unveraendert durch)
 *   {handle}.aeli.so  -> /p/{handle}  (die oeffentliche Bio-Seite)
 *
 * Anders als Aeras Proxy braucht Aeli dafuer keine Datenbank: der Handle IST
 * das Label. Ein unbekannter Handle wird nicht hier abgewiesen, sondern von
 * der Seite selbst — dann sieht der Besucher eine erklaerende 404 statt einer
 * leeren vom Server.
 *
 * Lokal gibt es keine Subdomains. `/p/{handle}` funktioniert deshalb auf jedem
 * Host direkt, ohne Sonderfall.
 */

/** Pfade, die auf JEDEM Host erreichbar bleiben muessen. */
const HOST_NEUTRAL_PREFIXES = [
  "/api",
  "/_next",
  "/legal",
  "/impressum",
  "/datenschutz",
  "/agb",
  "/robots.txt",
  "/sitemap.xml",
] as const;

/**
 * Flaechen, die auf den Apex gehoeren. Auf einer Profil-Subdomain ausgeliefert
 * wuerden sie Adressen wie `marie.aeli.so/studio` erzeugen, deren relative
 * Links dann alle den falschen Host behalten — und Suchmaschinen faenden
 * dieselbe Anmeldemaske unter jedem Handle.
 */
const APEX_ONLY_PREFIXES = [
  "/studio",
  "/login",
  "/signup",
  "/logout",
  "/onboarding",
  "/preise",
  "/pricing",
] as const;

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Alles aus `public/` — Icons, Schriften, das OG-Fallbackbild — muss auf jedem
 * Host unveraendert ausgeliefert werden. Sonst wird aus
 * `marie.aeli.so/icon.svg` ein `/p/marie/icon.svg`, das es nicht gibt.
 *
 * Erkennungsmerkmal ist die Dateiendung im letzten Segment. Handles koennen
 * keinen Punkt enthalten (siehe lib/handle.ts), hier kann also nichts
 * Echtes verschluckt werden.
 */
function isStaticAsset(pathname: string): boolean {
  return pathname.slice(pathname.lastIndexOf("/") + 1).includes(".");
}

function apexOrigin(): string | null {
  const configured = (process.env.AELI_APP_URL ?? "").trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

export function proxy(req: NextRequest) {
  const hostname = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const root = (process.env.NEXT_PUBLIC_AELI_ROOT_DOMAIN ?? "localhost")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[/:].*$/, "")
    .toLowerCase();
  const url = req.nextUrl;

  const isApex =
    hostname === root ||
    hostname === `www.${root}` ||
    hostname === "localhost" ||
    hostname === "127.0.0.1";

  if (isApex) return NextResponse.next();

  if (isStaticAsset(url.pathname) || matchesPrefix(url.pathname, HOST_NEUTRAL_PREFIXES)) {
    return NextResponse.next();
  }

  if (!hostname.endsWith(`.${root}`)) {
    // Fremder Host. Aeli kennt (noch) keine eigenen Domains pro Profil — bis
    // dahin ist das schlicht nichts von uns.
    return notFound();
  }

  const label = hostname.slice(0, -1 * (root.length + 1));

  // Mehrstufige Labels (`a.b.aeli.so`) gibt es nicht: ein Wildcard-Zertifikat
  // deckt genau eine Ebene ab, alles darunter waere ohnehin ohne TLS.
  if (label.includes(".")) return notFound();

  if (RESERVED_HANDLES.has(label)) return NextResponse.next();
  if (!isValidHandle(label)) return notFound();

  // Studio & Co. gehoeren auf den Apex. Nur GET/HEAD umleiten: eine
  // Server-Action ist ein POST, und ein Redirect ueber die Herkunft hinweg
  // wuerde deren Origin-Pruefung mit einem verwirrenden Fehler beenden.
  if (matchesPrefix(url.pathname, APEX_ONLY_PREFIXES)) {
    const origin = apexOrigin();
    if (origin && (req.method === "GET" || req.method === "HEAD")) {
      return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, origin), 308);
    }
    return NextResponse.next();
  }

  const rewritten = url.clone();
  rewritten.pathname = `/p/${label}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(rewritten);
}

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
