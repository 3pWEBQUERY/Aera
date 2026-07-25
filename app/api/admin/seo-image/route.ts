import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/guards";
import { rateLimit } from "@/lib/rate-limit";
import { uploadObject, isAllowedImage, extensionFor } from "@/lib/storage";
import { MAX_IMAGE_BYTES, magicBytesMatch } from "@/lib/upload-policy";

const noStore = { "Cache-Control": "no-store" };

/**
 * Upload for the platform og:image. Platform admins only.
 *
 * The file goes to the `platform/` prefix and gets no StorageObject row: it
 * belongs to no tenant, so it must not consume a tenant's storage quota, be
 * deleted by a tenant lifecycle job, or appear in a creator's media library.
 * Delivery runs through /api/platform-media.
 */
export async function POST(req: Request) {
  // Throws a 404 for everyone else — the admin area stays invisible.
  const admin = await requirePlatformAdmin();

  if (!(await rateLimit(`admin:seo-image:${admin.id}`, 20, 60 * 60_000))) {
    return NextResponse.json({ error: "Too many uploads" }, { status: 429, headers: noStore });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400, headers: noStore });
  }

  const contentType = file.type.toLowerCase();
  if (!isAllowedImage(contentType)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 415, headers: noStore });
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413, headers: noStore });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Die Endung sagt nichts. Nur der tatsaechliche Dateikopf entscheidet, ob
  // hier wirklich ein Bild liegt.
  if (!magicBytesMatch(contentType, bytes.subarray(0, 4096))) {
    return NextResponse.json(
      { error: "Content does not match its type" },
      { status: 400, headers: noStore },
    );
  }

  // Inhalts-Hash als Name: derselbe Upload erzeugt dieselbe URL, und ein neues
  // Bild bekommt zwingend eine neue — Caches koennen nicht veralten.
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const suffix = `seo/og-${digest}.${extensionFor(contentType)}`;
  const stored = await uploadObject({
    key: `platform/${suffix}`,
    body: bytes,
    contentType,
  });

  // uploadObject liefert im S3-Modus die Tenant-Proxy-URL, die eine
  // StorageObject-Zeile voraussetzt. Plattform-Assets haben keine.
  const url = stored.startsWith("/api/media/")
    ? `/api/platform-media/${suffix}`
    : stored;

  return NextResponse.json({ url }, { headers: noStore });
}
