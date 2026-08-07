import "server-only";
import { systemPrisma } from "./prisma";
import { env } from "./env";
import type { AeliStatus } from "@/app/generated/prisma/client";

/**
 * Aeras Blick auf Aeli.
 *
 * Beide Produkte liegen in derselben Datenbank und teilen sich die
 * `User`-Tabelle. Wer hier eingeloggt ist, IST auf aeli.so dieselbe Person —
 * eine Verknüpfung im Sinne von „zwei Konten zusammenführen" gibt es deshalb
 * gar nicht. Was es gibt, ist `AeliProfile.linkedTenantId`: der Zeiger von
 * einer Bio-Seite auf eine Community.
 *
 * Alle Zugriffe hier laufen über `systemPrisma`. Die Aeli-Tabellen gehören
 * nicht zur Tenant-Isolation (kein `tenantId`, eigene Rolle `aeli_app`), und
 * der tenant-gebundene Client hätte auf sie keine Rechte. Die Abfragen sind
 * dafür eng: immer auf genau einen Nutzer oder genau eine Community begrenzt.
 */

export interface AeliPageSummary {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  status: AeliStatus;
  linkedTenantId: string | null;
  /** Name der Community, auf die die Seite gerade zeigt (falls eine andere). */
  linkedTenantName: string | null;
  /** Der Kontoinhaber — für fremde Seiten die einzige Angabe, die zählt. */
  ownerEmail: string;
}

export interface AeliConnection {
  /** Die Aeli-Seite DIESES Kontos, falls es eine gibt. */
  own: AeliPageSummary | null;
  /**
   * Seiten ANDERER Konten, die auf diese Community zeigen — entstanden über
   * einen Verbindungscode. Sie stehen im Dashboard, weil der Besitzer der
   * Community sonst nie erführe, wer auf ihn verweist.
   */
  foreign: AeliPageSummary[];
}

const SELECT = {
  id: true,
  handle: true,
  displayName: true,
  avatarUrl: true,
  status: true,
  linkedTenantId: true,
  user: { select: { email: true } },
  linkedTenant: { select: { name: true } },
} as const;

type Row = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  status: AeliStatus;
  linkedTenantId: string | null;
  user: { email: string };
  linkedTenant: { name: string } | null;
};

/**
 * Aeli speichert Bildadressen relativ (`/api/media/...`), weil sie dort über
 * die eigene App ausgeliefert werden. In Aeras Dashboard zeigt derselbe Pfad
 * ins Leere — hier läuft eine andere App auf einem anderen Host. Also absolut
 * machen, und zwar nur für genau diesen Fall.
 */
function absoluteMedia(url: string | null): string | null {
  if (!url || !url.startsWith("/api/media/")) return url;
  return `${env.AELI_APP_URL}${url}`;
}

function toSummary(row: Row): AeliPageSummary {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    avatarUrl: absoluteMedia(row.avatarUrl),
    status: row.status,
    linkedTenantId: row.linkedTenantId,
    linkedTenantName: row.linkedTenant?.name ?? null,
    ownerEmail: row.user.email,
  };
}

export async function getAeliConnection(
  userId: string,
  tenantId: string,
): Promise<AeliConnection> {
  const [own, foreign] = await Promise.all([
    systemPrisma.aeliProfile.findUnique({ where: { userId }, select: SELECT }),
    systemPrisma.aeliProfile.findMany({
      where: { linkedTenantId: tenantId, userId: { not: userId } },
      select: SELECT,
      orderBy: { handle: "asc" },
      take: 20,
    }),
  ]);

  return {
    own: own ? toSummary(own as Row) : null,
    foreign: (foreign as Row[]).map(toSummary),
  };
}

/** Gibt es diesen Handle schon? Beantwortet mit ja/nein, ohne fremde Daten. */
export async function aeliHandleTaken(handle: string): Promise<boolean> {
  const existing = await systemPrisma.aeliProfile.findUnique({
    where: { handle },
    select: { id: true },
  });
  return Boolean(existing);
}

/**
 * Die öffentliche Adresse einer Aeli-Seite.
 *
 * Spiegelt `aeli.so/lib/url.ts`: in Produktion die Subdomain, lokal der Pfad —
 * denn ohne Wildcard-DNS gibt es keine Subdomains.
 */
export function aeliPageUrl(handle: string): string {
  const root = env.AELI_ROOT_DOMAIN;
  if (!root || root === "localhost" || !root.includes(".")) {
    return `${env.AELI_APP_URL}/p/${handle}`;
  }
  return `https://${handle}.${root}`;
}

/** Der Einstieg ins Aeli-Studio — für die Knöpfe, die aus Aera hinausführen. */
export function aeliStudioUrl(path = "/studio"): string {
  return `${env.AELI_APP_URL}${path}`;
}
