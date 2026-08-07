import { NextResponse } from "next/server";
import { systemPrisma } from "@/lib/prisma";
import { checkBucket } from "@/lib/storage";
import { storageConfigured } from "@/lib/env";

/**
 * Bereitschaftsanzeige für Railway und für den Blick von außen.
 *
 * Die Datenbank entscheidet über `ok`. Der Bucket steht daneben, ohne den
 * Ausschlag zu geben: eine Aeli-Seite funktioniert auch dann vollständig, wenn
 * gerade kein Bild hochgeladen werden kann — und ein Deployment wegen einer
 * kurzzeitig unerreichbaren Objektablage abzulehnen, würde eine laufende
 * Version durch gar keine ersetzen.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const [database, bucket] = await Promise.all([
    systemPrisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false),
    storageConfigured() ? checkBucket() : Promise.resolve(false),
  ]);

  return NextResponse.json(
    {
      ok: database,
      database,
      // `null` = gar nicht eingerichtet, `false` = eingerichtet, aber gerade
      // nicht erreichbar. Der Unterschied ist beim Suchen der halbe Weg.
      bucket: storageConfigured() ? bucket : null,
    },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
