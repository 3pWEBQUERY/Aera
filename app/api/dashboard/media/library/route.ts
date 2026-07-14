import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";

// GET ?slug=&q=&take= → { items: [{ id, url, name, contentType }] }
// Tenant images for the media picker; optional `q` searches name/key.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = String(url.searchParams.get("slug") ?? "");
  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });
  const q = String(url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const take = Math.min(120, Math.max(12, Number(url.searchParams.get("take")) || 60));

  const { tenant } = await requireTenantAdmin(slug);

  const objects = await prisma.storageObject.findMany({
    where: {
      tenantId: tenant.id,
      contentType: { startsWith: "image/" },
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" as const } },
              { key: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, url: true, key: true, contentType: true, displayName: true },
  });

  const items = objects.map((o) => ({
    id: o.id,
    url: o.url,
    name: o.displayName ?? (o.key.split("/").pop() || "image"),
    contentType: o.contentType ?? "image/png",
  }));

  return NextResponse.json({ items });
}
