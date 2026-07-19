import { NextResponse } from "next/server";
import prisma, { setTenantContext } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildAccessContext, canAccess } from "@/lib/entitlements";
import { getObject } from "@/lib/storage";
import { hasPlatformAdminAccess } from "@/lib/platform-admin";
import type { Visibility } from "@/app/generated/prisma/client";

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
  const isPublic =
    tenantActive && object.visibility === "PUBLIC" && !object.requiredEntitlementKey;
  // Resolve the global identity before activating tenant RLS. Otherwise a
  // platform admin who is not also a tenant member would disappear behind
  // the User membership policy and could not perform moderation.
  const user = isPublic ? null : await getCurrentUser();
  setTenantContext(object.tenantId);
  if (!isPublic) {
    // Gated object: require an active membership (MEMBERS), a paid
    // entitlement (PAID) or the specific entitlement key. Platform admins
    // may always view media for moderation.
    const isPlatformAdmin = hasPlatformAdminAccess(user);
    if (!isPlatformAdmin) {
      if (!tenantActive) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const ctx = await buildAccessContext(object.tenantId, user?.id ?? null);
      const allowed = canAccess(
        {
          visibility: object.visibility as Visibility,
          requiredEntitlementKey: object.requiredEntitlementKey,
        },
        ctx,
      );
      if (!allowed) {
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
