import { NextResponse } from "next/server";
import { getObject } from "@/lib/storage";

/**
 * Public delivery for platform-owned assets (currently the og:image set in
 * /admin/seo).
 *
 * Deliberately separate from /api/media: that route resolves a StorageObject
 * row to decide who may see a file. Platform assets belong to no tenant, have
 * no such row, and are public by definition — so instead of loosening the
 * tenant boundary there, this route hard-codes the `platform/` prefix and
 * serves nothing else.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await params;

  // No traversal, no absolute paths, no empty segments — the prefix below is
  // only a real boundary if the suffix cannot climb out of it.
  const decoded = segments.map((s) => decodeURIComponent(s));
  if (
    decoded.length === 0 ||
    decoded.some((s) => !s || s === "." || s === ".." || s.includes("/") || s.includes("\\"))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const fetched = await getObject(`platform/${decoded.join("/")}`);
  if (!fetched) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(fetched.body, {
    headers: {
      "Content-Type": fetched.contentType ?? "application/octet-stream",
      ...(fetched.contentLength
        ? { "Content-Length": String(fetched.contentLength) }
        : {}),
      // Der Schluessel enthaelt den Inhalts-Hash: gleiche URL = gleiches Bild.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
