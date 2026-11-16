import { NextResponse } from "next/server";
import prisma, { setTenantContext, withTenantContext } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildAccessContext } from "@/lib/entitlements";
import { getObject, storageProxyUrl } from "@/lib/storage";
import { hasPlatformAdminAccess } from "@/lib/platform-admin";
import {
  ANONYMOUS_ACCESS,
  canViewMedia,
  findMediaReferences,
  isContentGatedPurpose,
  type MediaReference,
} from "@/lib/media-access";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await params;
  const key = segments.map((s) => decodeURIComponent(s)).join("/");

  const object = await prisma.storageObject.findFirst({
    where: { key },
    include: { tenant: { select: { status: true } } },
  });
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tenantActive = object.tenant.status === "ACTIVE";
  // Media of posts, courses, gallery items and pages follows the gate of the
  // content that uses it (lib/media-access.ts), checked on every request so
  // that refunds and gate changes take effect at once.
  const refs: MediaReference[] | null = isContentGatedPurpose(object.purpose)
    ? await withTenantContext(object.tenantId, () =>
        findMediaReferences({
          tenantId: object.tenantId,
          purpose: object.purpose,
          urls: [object.url, storageProxyUrl(object.key)],
        }),
      )
    : null;
  // Truly public: an anonymous visitor would be handed this URL anyway.
  const isPublic = tenantActive && canViewMedia(object, refs, ANONYMOUS_ACCESS);
  // Resolve the global identity before activating tenant RLS. Otherwise a
  // platform admin who is not also a tenant member would disappear behind
  // the User membership policy and could not perform moderation.
  const user = isPublic ? null : await getCurrentUser();
  setTenantContext(object.tenantId);
  if (!isPublic) {
    // Gated object: the viewer needs the access the owning content asks
    // for (membership, a paid tier or the specific entitlement key).
    // Platform admins may always view media for moderation.
    const isPlatformAdmin = hasPlatformAdminAccess(user);
    if (!isPlatformAdmin) {
      if (!tenantActive) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const ctx = await buildAccessContext(object.tenantId, user?.id ?? null);
      if (!canViewMedia(object, refs, ctx)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const range = req.headers.get("range") ?? undefined;
  const fetched = await getObject(key, range);
  if (!fetched) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": object.contentType ?? fetched.contentType ?? "application/octet-stream",
    // Gated content must not land in shared caches.
    // Public media remains revocable: tenant suspension, deletion or a later
    // visibility change must propagate within minutes, not after one year.
    "Cache-Control": isPublic
      ? "public, max-age=300, stale-while-revalidate=60"
      : "private, no-store, max-age=0",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };
  if (!isPublic) headers.Vary = "Cookie, Authorization";
  if (fetched.contentLength !== undefined) {
    headers["Content-Length"] = String(fetched.contentLength);
  }

  // ?download=<name> forces a save dialog with a friendly filename.
  const download = new URL(req.url).searchParams.get("download");
  if (download) {
    const safe = download.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "download";
    headers["Content-Disposition"] = `attachment; filename="${safe}"`;
  }

  // Partial content for video seeking — body is streamed, never buffered.
  if (range && fetched.contentRange) {
    headers["Content-Range"] = fetched.contentRange;
    return new Response(fetched.body, { status: 206, headers });
  }

  return new Response(fetched.body, { headers });
}
