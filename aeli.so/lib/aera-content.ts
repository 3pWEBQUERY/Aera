import "server-only";
import prisma from "./prisma";
import { communityUrl } from "./url";
import { AERA_FETCH_LIMIT, aeraContentKind, type AeraContentKind } from "./blocks";
import type { AeliBlockType } from "@/app/generated/prisma/client";
import type { PublicLocale } from "./public-strings";
import {
  EMPTY_AERA_CONTENT,
  type AeraContent,
  type AeraCourse,
  type AeraEvent,
  type AeraProduct,
  type AeraSpace,
  type AeraTier,
} from "@/components/page/types";

/**
 * Was die verknuepfte Community gerade zu bieten hat.
 *
 * Die AERA_*-Bausteine tragen keinen eigenen Inhalt. Der Creator setzt den
 * Baustein einmal, und ab da zeigt die Bio-Seite, was in Aera steht — ein
 * verschobener Termin verschiebt sich hier mit, ein ausverkauftes Produkt
 * verschwindet. Genau dafuer sind sie da: abgetippte Inhalte laufen
 * auseinander, sobald sich das Original aendert.
 *
 * Gelesen wird ueber den normalen `prisma`-Client, also unter der Rolle
 * `aeli_app`. Die `where`-Klauseln hier sind deshalb KEINE Sicherheitsgrenze,
 * sondern nur Auswahl: was oeffentlich ist, entscheiden die Policies der
 * Migration 20260808120000_aeli_aera_blocks. Faellt eine Klausel hier weg,
 * kommen trotzdem keine privaten Zeilen zurueck.
 *
 * Die eine Einschraenkung, die wirklich hier gehoert, ist `tenantId`: die
 * Policies lassen oeffentliche Inhalte JEDER aktiven Community durch — sie
 * koennen nicht wissen, welche zu dieser Seite gehoert.
 */



interface TenantRef {
  id: string;
  slug: string;
  subdomain?: string | null;
  customDomain?: string | null;
}

/**
 * Der Termin als Text.
 *
 * Formatiert wird hier und nicht in der Komponente, und das hat einen Grund:
 * die Bio-Seite wird auf dem Server gerendert und im Browser hydriert, das
 * Studio rendert dieselben Komponenten im Client. Eine Zeitangabe ohne
 * ausdrueckliche Zeitzone faellt dabei je nach Ort anders aus — der Server
 * schreibt „19:00", der Browser des Besuchers macht „20:00" daraus, und React
 * meldet einen Hydrations-Fehler. Als fertige Zeichenkette kann das nicht
 * passieren: sie wird einmal gebildet und danach nur noch durchgereicht.
 *
 * Massgeblich ist damit die Zeitzone des Servers. Fuer Aera ist das dieselbe
 * Wahl, die die Community-Seite trifft — beide Seiten zeigen denselben Termin
 * gleich an, und das ist wichtiger als die Ortszeit des Besuchers.
 */
function formatEventDate(date: Date, locale: PublicLocale) {
  const tag = locale === "de" ? "de-DE" : "en-GB";
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(tag, options).format(date);

  return {
    dayLabel: part({ day: "numeric" }),
    // Ohne Punkt: „Sep." neben einer grossen Zahl ist ein Satzzeichen zu viel.
    monthLabel: part({ month: "short" }).replace(/\.$/, ""),
    timeLabel: part({ hour: "2-digit", minute: "2-digit" }),
    dateLabel: part({
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export async function loadAeraContent(
  tenant: TenantRef,
  blockTypes: Iterable<AeliBlockType>,
  locale: PublicLocale,
): Promise<AeraContent> {
  const kinds = new Set<AeraContentKind>();
  for (const type of blockTypes) {
    const kind = aeraContentKind(type);
    if (kind) kinds.add(kind);
  }
  // Der haeufigste Fall: eine Seite ohne AERA_*-Baustein. Sie soll dafuer keine
  // einzige Abfrage bezahlen.
  if (kinds.size === 0) return EMPTY_AERA_CONTENT;

  const base = communityUrl(tenant);
  const spaceUrl = (slug: string) => `${base}/s/${slug}`;

  const [events, tiers, products, courses, spaces] = await Promise.all([
    kinds.has("events") ? loadEvents(tenant.id, spaceUrl, locale) : [],
    kinds.has("tiers") ? loadTiers(tenant.id, `${base}/join`) : [],
    kinds.has("products") ? loadProducts(tenant.id, spaceUrl) : [],
    kinds.has("courses") ? loadCourses(tenant.id, spaceUrl) : [],
    kinds.has("spaces") ? loadSpaces(tenant.id, spaceUrl) : [],
  ]);

  return { events, tiers, products, courses, spaces };
}

async function loadEvents(
  tenantId: string,
  spaceUrl: (slug: string) => string,
  locale: PublicLocale,
): Promise<AeraEvent[]> {
  const rows = await prisma.event.findMany({
    // Vergangene Termine gehoeren ins Archiv, nicht auf eine Visitenkarte.
    where: { tenantId, startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    take: AERA_FETCH_LIMIT,
    select: {
      id: true,
      title: true,
      startsAt: true,
      location: true,
      isOnline: true,
      space: { select: { slug: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    ...formatEventDate(row.startsAt, locale),
    startsAt: row.startsAt.toISOString(),
    location: row.location,
    isOnline: row.isOnline,
    url: spaceUrl(row.space.slug),
  }));
}

async function loadTiers(tenantId: string, joinUrl: string): Promise<AeraTier[]> {
  const rows = await prisma.membershipTier.findMany({
    where: { tenantId },
    // Wie in Aera: die Reihenfolge des Creators, dann der Name.
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: AERA_FETCH_LIMIT,
    select: {
      id: true,
      name: true,
      description: true,
      priceCents: true,
      currency: true,
      interval: true,
      isRecommended: true,
    },
  });

  return rows.map((row) => ({ ...row, url: joinUrl }));
}

async function loadProducts(
  tenantId: string,
  spaceUrl: (slug: string) => string,
): Promise<AeraProduct[]> {
  const rows = await prisma.product.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    take: AERA_FETCH_LIMIT,
    select: {
      id: true,
      name: true,
      priceCents: true,
      currency: true,
      coverUrl: true,
      space: { select: { slug: true } },
    },
  });

  return rows.flatMap((row) =>
    // `spaceId` ist im Schema optional; die Policy laesst raumlose Produkte
    // ohnehin nicht durch. Der Filter hier ist die typseitige Entsprechung —
    // ohne Raum gaebe es kein Ziel zum Verlinken.
    row.space
      ? [
          {
            id: row.id,
            name: row.name,
            priceCents: row.priceCents,
            currency: row.currency,
            coverUrl: row.coverUrl,
            url: spaceUrl(row.space.slug),
          },
        ]
      : [],
  );
}

async function loadCourses(
  tenantId: string,
  spaceUrl: (slug: string) => string,
): Promise<AeraCourse[]> {
  const rows = await prisma.course.findMany({
    where: { tenantId },
    orderBy: { title: "asc" },
    take: AERA_FETCH_LIMIT,
    select: {
      id: true,
      title: true,
      description: true,
      coverUrl: true,
      space: { select: { slug: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    coverUrl: row.coverUrl,
    url: spaceUrl(row.space.slug),
  }));
}

async function loadSpaces(
  tenantId: string,
  spaceUrl: (slug: string) => string,
): Promise<AeraSpace[]> {
  const rows = await prisma.space.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: AERA_FETCH_LIMIT,
    select: { id: true, name: true, icon: true, description: true, slug: true },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    description: row.description,
    url: spaceUrl(row.slug),
  }));
}
