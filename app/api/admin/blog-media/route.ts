import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/guards";
import { rateLimit } from "@/lib/rate-limit";
import { uploadObject, isAllowedImage, isAllowedVideo, extensionFor } from "@/lib/storage";
import { MAX_IMAGE_BYTES, magicBytesMatch } from "@/lib/upload-policy";

const noStore = { "Cache-Control": "no-store" };

/**
 * Bilder und Videos fuer den Aera-Blog. Nur Plattform-Admins.
 *
 * Gleiche Bauart wie /api/admin/seo-image und aus demselben Grund getrennt vom
 * normalen Upload: der laeuft ueber ein Kontingent, eine `StorageObject`-Zeile
 * und die Mediathek einer Community. Ein Blogbeitrag der Plattform gehoert
 * keiner Community — er darf weder deren Speicher verbrauchen noch in deren
 * Mediathek auftauchen noch von deren Loeschlauf mitgenommen werden.
 *
 * Videos sind hier auf 32 MB begrenzt, obwohl die Plattform sonst bis 512 MB
 * erlaubt. Der Grund ist die Bauart dieser Route: sie liest die Datei
 * vollstaendig in den Speicher, weil nur so die Dateisignatur geprueft werden
 * kann, bevor irgendetwas abgelegt wird. Grosse Dateien laufen deshalb ueber
 * den mehrstufigen Weg mit Reservierung — den gibt es fuer die Plattform
 * (noch) nicht. 32 MB reichen fuer den Fall, um den es geht: ein kurzer
 * Mitschnitt, der eine neue Funktion zeigt. Wer mehr braucht, verlinkt.
 */
const MAX_BLOG_VIDEO_BYTES = 32 * 1024 * 1024;

export async function POST(req: Request) {
  // Wirft fuer alle anderen einen 404 — der Admin-Bereich bleibt unsichtbar.
  const admin = await requirePlatformAdmin();

  if (!(await rateLimit(`admin:blog-media:${admin.id}`, 60, 60 * 60_000))) {
    return NextResponse.json({ error: "Zu viele Uploads" }, { status: 429, headers: noStore });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei" }, { status: 400, headers: noStore });
  }

  const contentType = file.type.toLowerCase();
  const image = isAllowedImage(contentType);
  const video = isAllowedVideo(contentType);
  if (!image && !video) {
    return NextResponse.json(
      { error: "Dieses Dateiformat geht hier nicht." },
      { status: 415, headers: noStore },
    );
  }

  const limit = image ? MAX_IMAGE_BYTES : MAX_BLOG_VIDEO_BYTES;
  if (file.size <= 0 || file.size > limit) {
    return NextResponse.json(
      {
        error: image
          ? `Bilder bis ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`
          : `Videos bis ${Math.round(MAX_BLOG_VIDEO_BYTES / 1024 / 1024)} MB.`,
      },
      { status: 413, headers: noStore },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Die Endung sagt nichts, und der vom Browser gemeldete Typ auch nicht. Nur
  // der tatsaechliche Dateikopf entscheidet.
  if (!magicBytesMatch(contentType, bytes.subarray(0, 4096))) {
    return NextResponse.json(
      { error: "Die Datei ist nicht das, was sie zu sein vorgibt." },
      { status: 400, headers: noStore },
    );
  }

  // Inhalts-Hash als Name: derselbe Upload erzeugt dieselbe URL, ein neues Bild
  // zwingend eine neue. Damit kann kein Zwischenspeicher veralten, und ein
  // zweimal hochgeladenes Bild belegt den Platz nur einmal.
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const suffix = `blog/${digest}.${extensionFor(contentType)}`;
  const stored = await uploadObject({ key: `platform/${suffix}`, body: bytes, contentType });

  // uploadObject liefert im S3-Modus die Tenant-Proxy-URL, die eine
  // StorageObject-Zeile voraussetzt. Plattform-Dateien haben keine.
  const url = stored.startsWith("/api/media/") ? `/api/platform-media/${suffix}` : stored;

  return NextResponse.json({ url }, { headers: noStore });
}
