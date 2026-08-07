import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { systemPrisma, withAeliTransaction } from "@/lib/prisma";
import { deviceFromUserAgent, visitorHash } from "@/lib/analytics";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { referrerHost } from "@/lib/url";

/**
 * Der Zähl-Endpunkt. Ein Aufruf, ein Klick — mehr kann er nicht.
 *
 * Bewusst ohne Anmeldung: er wird von jeder öffentlichen Seite aufgerufen. Was
 * ihn trotzdem eingrenzt, ist die RLS-Policy `aeli_public_event_insert` — sie
 * lässt Einträge nur für Profile zu, die wirklich veröffentlicht sind. Eine
 * erfundene `profileId` erzeugt hier also keinen Datensatz, sondern einen
 * Datenbankfehler, den wir schlucken.
 */

const payloadSchema = z.object({
  profileId: z.string().min(1).max(40),
  kind: z.enum(["VIEW", "CLICK"]),
  blockId: z.string().min(1).max(40).optional(),
});

/** Kein Inhalt: `sendBeacon` liest die Antwort ohnehin nie. */
function accepted(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const headers = request.headers;

  // Die Grenze schützt nicht vor Manipulation — sie verhindert, dass ein
  // Skript die Ereignistabelle in Minuten aufbläht. Wer eine Zahl fälschen
  // will, schafft das ohnehin; wer die Datenbank füllen will, nicht.
  if (!rateLimit(`track:${clientIp(headers)}`, 240, 60_000).ok) {
    return new NextResponse(null, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await request.json());
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const userAgent = headers.get("user-agent") ?? "";
  const isClick = payload.kind === "CLICK" && Boolean(payload.blockId);

  try {
    /**
     * Rohes INSERT statt `prisma.aeliClick.create` — und zwar zwingend.
     *
     * Prisma hängt an jedes `create` ein `RETURNING *`, und ein RETURNING
     * verlangt, dass die neue Zeile auch die SELECT-Policies passiert. Die
     * öffentliche Rolle darf hier aber ausdrücklich nur schreiben, nicht lesen
     * (`aeli_public_event_insert` ist FOR INSERT). Der Datensatz landete
     * dadurch nie in der Datenbank, und weil dieser Pfad Fehler schluckt, fiel
     * es nur an einer Statistik auf, die auf null stand.
     *
     * Die id kommt aus dem Prozess, weil `@default(cuid())` in Prisma
     * clientseitig erzeugt wird und in rohem SQL deshalb fehlt.
     */
    await withAeliTransaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "AeliClick"
          ("id", "profileId", "blockId", "kind", "referrerHost", "visitorHash", "device", "country")
        VALUES (
          ${randomUUID()},
          ${payload.profileId},
          ${isClick ? payload.blockId! : null},
          ${isClick ? "CLICK" : "VIEW"}::"AeliEventKind",
          ${referrerHost(headers.get("referer"))},
          ${visitorHash(userAgent, headers.get("accept-language") ?? "")},
          ${deviceFromUserAgent(userAgent)}::"AeliDevice",
          ${headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry") ?? null}
        )
      `;
    });

    if (isClick) await bumpClickCount(payload.blockId!, payload.profileId);
  } catch {
    // Eine fehlgeschlagene Zählung darf nie zu einer sichtbaren Störung auf der
    // Seite werden. Der Besucher wollte einen Link öffnen, keine Statistik führen.
  }

  return accepted();
}

/**
 * Der denormalisierte Zähler an `AeliBlock`.
 *
 * Er läuft absichtlich NICHT über die Rolle `aeli_app`: die darf auf fremde
 * Blöcke nur lesen, und ein Schreibrecht für die Öffentlichkeit einzurichten,
 * nur um eine Zahl hochzuzählen, würde nebenbei auch Titel und Ziele
 * beschreibbar machen. Stattdessen ein einzelnes, eng gefasstes SQL über die
 * privilegierte Verbindung, das die Bedingung der Policy ausdrücklich noch
 * einmal stellt: derselbe Block, dasselbe Profil, veröffentlicht.
 *
 * Es ist bewusst nicht Teil derselben Transaktion wie das Ereignis oben. Das
 * Log ist die Wahrheit, der Zähler nur ein schneller Auszug für Studio-Liste
 * und Smart-Sortierung; im seltenen Fehlerfall fehlt eine Eins, und das ist
 * billiger als ein verlorener Klick.
 */
async function bumpClickCount(blockId: string, profileId: string): Promise<void> {
  await systemPrisma.$executeRaw`
    UPDATE "AeliBlock" b
    SET "clickCount" = b."clickCount" + 1
    FROM "AeliProfile" p
    WHERE b."id" = ${blockId}
      AND p."id" = b."profileId"
      AND p."id" = ${profileId}
      AND p."status" = 'PUBLISHED'
  `;
}
