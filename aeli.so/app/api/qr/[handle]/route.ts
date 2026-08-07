import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { isValidHandle } from "@/lib/handle";
import { profileUrl } from "@/lib/url";

/**
 * Der QR-Code einer Seite als SVG.
 *
 * Serverseitig, damit er auch ohne JavaScript da ist — und als SVG, weil ein
 * QR-Code auf einem Plakat genauso scharf sein muss wie auf einem Handy.
 *
 * Der Inhalt hängt ausschließlich am Handle, nicht am Profil: es wird nichts
 * aus der Datenbank gelesen. Ein Code für einen Handle, den es (noch) nicht
 * gibt, ist kein Problem — er führt dann eben auf die „gibt's noch nicht“-Seite.
 * Das erspart eine Abfrage auf einem Pfad, den jede Seitenansicht auslöst.
 */

export const dynamic = "force-static";
export const revalidate = 86_400;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const normalized = handle.trim().toLowerCase();
  if (!isValidHandle(normalized)) {
    return new NextResponse(null, { status: 404 });
  }

  const svg = await QRCode.toString(profileUrl(normalized), {
    type: "svg",
    margin: 0,
    // Fehlerkorrektur „M“: verträgt rund 15 % Verdeckung. Höher wäre dichter
    // und damit aus der Entfernung schwerer zu lesen — und aus der Entfernung
    // wird ein QR-Code auf einer Bühne gescannt.
    errorCorrectionLevel: "M",
    color: { dark: "#000000ff", light: "#00000000" },
  });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
