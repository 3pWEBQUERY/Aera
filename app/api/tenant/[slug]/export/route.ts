import { NextResponse } from "next/server";
import { tenantHasFeature } from "@/lib/plan";
import { getCurrentUser } from "@/lib/auth";
import { systemPrisma, withTenantTransactionFor } from "@/lib/prisma";
import { activeRoleAtLeast } from "@/lib/tenant";
import {
  createTenantExport,
  DATA_EXPORT_SCHEMA_VERSION,
} from "@/lib/data-export";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  // Owners retain export access while asynchronous deletion is running. This
  // prevents DELETING from becoming a lock-out before the final legal copy was
  // downloaded; every data query below still carries an explicit tenant id.
  const tenant = await systemPrisma.tenant.findFirst({
    where: { slug, status: { in: ["ACTIVE", "DELETING"] } },
    select: { id: true, slug: true },
  });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await withTenantTransactionFor(tenant.id, (tx) =>
    tx.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    }),
  );
  if (!activeRoleAtLeast(membership, "OWNER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Package gate — the /export page is gated, so the download must be too.
  if (!(await tenantHasFeature(tenant.id, "export"))) {
    return NextResponse.json({ error: "plan_upgrade_required" }, { status: 402 });
  }

  const url = new URL(req.url);
  const dataset = url.searchParams.get("dataset");
  const format = url.searchParams.get("format");
  const result = createTenantExport({
    tenantId: tenant.id,
    slug: tenant.slug,
    dataset,
    format,
  });
  if (!result) {
    return NextResponse.json({ error: "Unknown dataset" }, { status: 400 });
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = dataset ? `-${dataset}` : "";
  return new Response(result.stream, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="aera-${tenant.slug}${suffix}-${stamp}.${result.extension}"`,
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Aera-Export-Schema": DATA_EXPORT_SCHEMA_VERSION,
    },
  });
}
