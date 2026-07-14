import { NextResponse } from "next/server";
import prisma, { setTenantContext } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildAccessContext, canAccess } from "@/lib/entitlements";
import { getObject } from "@/lib/storage";
import { env } from "@/lib/env";
import type { Visibility } from "@/app/generated/prisma/client";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await params;
  const key = segments.map((s) => decodeURIComponent(s)).join("/");

  const object = await prisma.storageObject.findFirst({ where: { key } });
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });
  setTenantContext(object.tenantId);

  const isPublic = object.visibility === "PUBLIC" && !object.requiredEntitlementKey;
  if (!isPublic) {
    // Gated object: require an active membership (MEMBERS), a paid
    // entitlement (PAID) or the specific entitlement key. Platform admins
    // may always view media for moderation.
    const user = await getCurrentUser();
    const isPlatformAdmin =
      !!user && env.PLATFORM_ADMIN_EMAILS.includes(user.email.toLowerCase());
    if (!isPlatformAdmin) {
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
    "Cache-Control": isPublic
      ? "public, max-age=31536000, immutable"
      : "private, max-age=0, must-revalidate",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };
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
