import "server-only";
import { createHmac } from "node:crypto";
import { env } from "./env";
import { queryAsAeliUser, withUserContext } from "./prisma";
import type { AeliDevice } from "@/app/generated/prisma/client";

/**
 * Statistik ohne Personenverfolgung.
 *
 * Was NICHT gespeichert wird: IP-Adresse, roher User-Agent, Cookie,
 * Fingerprint, vollständige Referrer-URL. Was gespeichert wird: ein Hash, der
 * jeden Tag ein anderer ist, der Host der Herkunft, die Geräteklasse.
 *
 * Der Effekt ist praktisch: „wie viele verschiedene Leute heute“ lässt sich
 * beantworten, „ist das dieselbe Person wie gestern“ nicht — und weil der
 * Salzwert täglich in den Hash eingeht, lässt sich das auch rückwirkend nicht
 * ändern. Deshalb braucht eine Aeli-Seite kein Einwilligungsbanner.
 */

/**
 * Tagesschlüssel in UTC. Bewusst nicht in Ortszeit: sonst hätte ein Besucher
 * beim Zeitzonenwechsel zwei Identitäten am selben Tag.
 */
function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function visitorHash(userAgent: string, acceptLanguage: string, date = new Date()): string {
  return createHmac("sha256", env.AELI_VISITOR_SALT)
    .update(`${dayKey(date)}|${userAgent}|${acceptLanguage}`)
    .digest("base64url")
    .slice(0, 22);
}

/**
 * Geräteklasse aus dem User-Agent — grob und mit Absicht.
 *
 * Die Frage, die ein Creator hat, ist „lohnt sich das Layout für Handys?“.
 * Dafür reichen drei Kübel. Eine feinere Erkennung wäre genau die Art von
 * Datensammlung, die diese Datei vermeidet.
 */
export function deviceFromUserAgent(userAgent: string): AeliDevice {
  const ua = userAgent.toLowerCase();
  if (!ua) return "UNKNOWN";
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return "TABLET";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(ua)) return "MOBILE";
  return "DESKTOP";
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

export interface DayPoint {
  day: string;
  views: number;
  clicks: number;
}

export interface AnalyticsSummary {
  views: number;
  clicks: number;
  visitors: number;
  /** Klicks je 100 Aufrufe — die eine Zahl, die etwas über die Seite sagt. */
  clickRate: number;
  series: DayPoint[];
  topBlocks: { blockId: string; title: string; type: string; clicks: number }[];
  referrers: { host: string; count: number }[];
  devices: { device: AeliDevice; count: number }[];
}

/**
 * Alles für das Statistik-Dashboard in einem Rutsch.
 *
 * Rohes SQL statt Prisma-Aggregaten: eine Zeitreihe mit lückenlosen Tagen
 * (`generate_series`) bekommt man sonst nur, indem man alle Ereignisse in den
 * Prozess holt und dort zählt — bei einer viel besuchten Seite ist das der
 * Unterschied zwischen einer Abfrage und einer halben Million Zeilen.
 *
 * Läuft über `queryAsAeliUser`, damit auch der rohe Pfad unter der Rolle
 * `aeli_app` und dem GUC `aeli.user_id` steht: die RLS-Policies entscheiden,
 * wessen Zahlen sichtbar sind, nicht das `WHERE` unten.
 */
export async function analyticsSummary(
  profileId: string,
  ownerId: string,
  days = 30,
): Promise<AnalyticsSummary> {
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  // Der Besitzer steht als Parameter da, nicht als Annahme: die Statistik ist
  // der einzige Teil der App, den die oeffentlichen Policies gar nicht sehen.
  return withUserContext(ownerId, () => queryAsAeliUser(async (tx) => {
    const [totals, series, topBlocks, referrers, devices] = await Promise.all([
      tx.$queryRaw<{ views: bigint; clicks: bigint; visitors: bigint }[]>`
        SELECT
          COUNT(*) FILTER (WHERE "kind" = 'VIEW')  AS views,
          COUNT(*) FILTER (WHERE "kind" = 'CLICK') AS clicks,
          -- Besucher nur ueber die Aufrufe zaehlen. Wuerde man alle Ereignisse
          -- nehmen, koennte die Besucherzahl ueber der Aufrufzahl liegen —
          -- eine Zahl, die niemandem etwas sagt ausser „hier stimmt was nicht".
          COUNT(DISTINCT "visitorHash") FILTER (WHERE "kind" = 'VIEW') AS visitors
        FROM "AeliClick"
        WHERE "profileId" = ${profileId} AND "ts" >= ${since}
      `,
      tx.$queryRaw<{ day: Date; views: bigint; clicks: bigint }[]>`
        SELECT
          d::date AS day,
          COUNT(e.*) FILTER (WHERE e."kind" = 'VIEW')  AS views,
          COUNT(e.*) FILTER (WHERE e."kind" = 'CLICK') AS clicks
        FROM generate_series(${since}::date, CURRENT_DATE, '1 day') AS d
        LEFT JOIN "AeliClick" e
          ON e."profileId" = ${profileId} AND e."ts" >= d AND e."ts" < d + INTERVAL '1 day'
        GROUP BY d
        ORDER BY d
      `,
      tx.$queryRaw<{ blockId: string; title: string | null; type: string; clicks: bigint }[]>`
        SELECT b."id" AS "blockId", b."title", b."type"::text AS type, COUNT(e.*) AS clicks
        FROM "AeliClick" e
        JOIN "AeliBlock" b ON b."id" = e."blockId"
        WHERE e."profileId" = ${profileId} AND e."kind" = 'CLICK' AND e."ts" >= ${since}
        GROUP BY b."id", b."title", b."type"
        ORDER BY clicks DESC
        LIMIT 8
      `,
      tx.$queryRaw<{ host: string | null; count: bigint }[]>`
        SELECT "referrerHost" AS host, COUNT(*) AS count
        FROM "AeliClick"
        WHERE "profileId" = ${profileId} AND "ts" >= ${since} AND "kind" = 'VIEW'
        GROUP BY "referrerHost"
        ORDER BY count DESC
        LIMIT 8
      `,
      tx.$queryRaw<{ device: AeliDevice; count: bigint }[]>`
        SELECT "device", COUNT(*) AS count
        FROM "AeliClick"
        WHERE "profileId" = ${profileId} AND "ts" >= ${since} AND "kind" = 'VIEW'
        GROUP BY "device"
        ORDER BY count DESC
      `,
    ]);

    const views = Number(totals[0]?.views ?? 0);
    const clicks = Number(totals[0]?.clicks ?? 0);

    return {
      views,
      clicks,
      visitors: Number(totals[0]?.visitors ?? 0),
      clickRate: views > 0 ? Math.round((clicks / views) * 1000) / 10 : 0,
      series: series.map((row) => ({
        day: row.day.toISOString().slice(0, 10),
        views: Number(row.views),
        clicks: Number(row.clicks),
      })),
      topBlocks: topBlocks.map((row) => ({
        blockId: row.blockId,
        title: row.title ?? "Ohne Titel",
        type: row.type,
        clicks: Number(row.clicks),
      })),
      referrers: referrers.map((row) => ({
        // Kein Referrer heißt: direkt eingegeben, aus einer App heraus oder
        // aus einer Bio-Zeile, die keinen mitschickt. Das ist bei Link-Seiten
        // die Mehrheit — deshalb bekommt der Fall einen Namen statt „—“.
        host: row.host ?? "Direkt / App",
        count: Number(row.count),
      })),
      devices: devices.map((row) => ({ device: row.device, count: Number(row.count) })),
    };
  }));
}
