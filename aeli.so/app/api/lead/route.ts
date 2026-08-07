import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { systemPrisma, withAeliTransaction } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Einsendungen aus Newsletter-, Kontakt- und E-Mail-Gate-Blöcken.
 *
 * Auch hier entscheidet die Datenbank, nicht diese Datei: `aeli_public_lead_insert`
 * lässt Einträge nur für veröffentlichte Profile zu, und Lesen ist der
 * Öffentlichkeit gar nicht erlaubt. Diese Route kann also weder fremde Leads
 * anlegen noch bestehende sehen — selbst wenn sie es versuchte.
 */

const payloadSchema = z.object({
  profileId: z.string().min(1).max(40),
  blockId: z.string().min(1).max(40).optional(),
  source: z.enum(["NEWSLETTER", "CONTACT", "GATE"]),
  email: z.email().max(320),
  name: z.string().max(120).optional(),
  message: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  // Enger als beim Zählen: eine Einsendung ist eine Handlung, keine Messung.
  if (!rateLimit(`lead:${ip}`, 12, 10 * 60_000).ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const email = payload.email.trim().toLowerCase();

  try {
    // Doppelte Eintragungen still schlucken: wer zweimal auf „Eintragen“ tippt,
    // soll nicht erfahren, dass er schon in der Liste steht — das wäre eine
    // Auskunft über fremde Daten an einen anonymen Absender.
    //
    // Die Frage selbst kann die öffentliche Rolle nicht stellen (auf `AeliLead`
    // hat sie INSERT und sonst nichts), deshalb läuft dieser eine Blick über
    // die privilegierte Verbindung — mit `select: { id: true }` und ohne dass
    // die Antwort nach außen sichtbar wird: der Aufrufer bekommt in beiden
    // Fällen dasselbe `ok`.
    //
    // Kontaktnachrichten sind ausgenommen. Wer zweimal schreibt, hat zweimal
    // etwas zu sagen.
    const existing =
      payload.source === "CONTACT"
        ? null
        : await systemPrisma.aeliLead.findFirst({
            where: { profileId: payload.profileId, email, source: payload.source },
            select: { id: true },
          });

    if (!existing) {
      // Rohes INSERT, aus demselben Grund wie in api/track: Prismas `create`
      // hängt ein RETURNING an, und die öffentliche Rolle darf `AeliLead`
      // ausdrücklich nur beschreiben, nicht lesen.
      await withAeliTransaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO "AeliLead" ("id", "profileId", "blockId", "source", "email", "name", "message")
          VALUES (
            ${randomUUID()},
            ${payload.profileId},
            ${payload.blockId ?? null},
            ${payload.source},
            ${email},
            ${payload.name?.trim() || null},
            ${payload.message?.trim() || null}
          )
        `;
      });
    }
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
