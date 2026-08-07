import { NextResponse } from "next/server";
import { getObject } from "@/lib/storage";

/**
 * Der Auslieferungsweg für Bilder aus dem privaten Bucket.
 *
 * Railway-Buckets sind privat, es gibt also keine öffentliche Objektadresse.
 * Statt den Bucket zu öffnen — was jede jemals hochgeladene Datei erratbar
 * machen würde — liefert diese Route aus, und zwar nur, was unter `aeli/`
 * liegt.
 *
 * Ohne Anmeldung: Profilbilder stehen auf einer öffentlichen Seite, ihre
 * Adresse steht im HTML. Eine Zugriffsprüfung wäre hier Theater.
 *
 * Wer den Bucket doch öffentlich schaltet oder ein CDN davorsetzt, trägt
 * `S3_PUBLIC_URL` ein — dann zeigen die gespeicherten Adressen direkt dorthin
 * und diese Route wird gar nicht mehr aufgerufen.
 */

export const runtime = "nodejs";

/**
 * Ein Jahr, unveränderlich — der Schlüssel enthält den Hash des Bildes, eine
 * Adresse zeigt also für immer auf denselben Inhalt. Wird das Profilbild
 * getauscht, ändert sich die Adresse mit.
 */
const CACHE = "public, max-age=31536000, immutable";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await params;
  const key = segments.map((segment) => decodeURIComponent(segment)).join("/");

  // Zwei Riegel: das Präfix begrenzt auf unseren eigenen Bereich, das Verbot
  // von „..“ verhindert, dass ein Segment daraus wieder herausführt.
  if (!key.startsWith("aeli/") || key.includes("..")) {
    return new NextResponse(null, { status: 404 });
  }

  const object = await getObject(key);
  if (!object) return new NextResponse(null, { status: 404 });

  // Unveränderliche Adresse plus ETag: der Browser fragt nach einem Jahr
  // einmal nach und bekommt ein 304 statt des Bildes.
  if (object.etag && request.headers.get("if-none-match") === object.etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: object.etag, "Cache-Control": CACHE } });
  }

  const headers = new Headers({
    "Content-Type": object.contentType ?? "application/octet-stream",
    "Cache-Control": CACHE,
    // Der Bucket enthält ausschließlich neu kodierte Bilder (lib/images.ts).
    // `nosniff` und die enge CSP stellen sicher, dass der Browser auch dann
    // nichts anderes daraus macht, wenn doch einmal etwas anderes darin läge.
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
  });
  if (object.etag) headers.set("ETag", object.etag);
  if (object.contentLength !== null) headers.set("Content-Length", String(object.contentLength));

  return new NextResponse(object.body, { headers });
}
