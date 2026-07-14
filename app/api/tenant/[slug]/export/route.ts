import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { roleAtLeast } from "@/lib/tenant";

type Row = Record<string, unknown>;

/** Tenant-scoped dataset registry. Each returns a flat array of rows. */
const DATASETS: Record<string, (t: string) => Promise<Row[]>> = {
  members: async (t) => {
    const rows = await prisma.membership.findMany({
      where: { tenantId: t },
      include: { user: { select: { name: true, email: true, createdAt: true } }, tier: { select: { name: true } } },
      orderBy: { joinedAt: "asc" },
    });
    return rows.map((m) => ({
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      status: m.status,
      tier: m.tier?.name ?? null,
      joinedAt: m.joinedAt,
    }));
  },
  entitlements: async (t) => {
    const rows = await prisma.entitlement.findMany({ where: { tenantId: t }, orderBy: { grantedAt: "asc" } });
    return rows.map((e) => ({ id: e.id, userId: e.userId, key: e.key, source: e.source, sourceId: e.sourceId, grantedAt: e.grantedAt, expiresAt: e.expiresAt }));
  },
  orders: async (t) => {
    const rows = await prisma.order.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" } });
    return rows.map((o) => ({ id: o.id, userId: o.userId, productId: o.productId, description: o.description, amountCents: o.amountCents, currency: o.currency, shippingCents: o.shippingCents, platformFeeCents: o.platformFeeCents, status: o.status, fulfilled: o.fulfilled, createdAt: o.createdAt }));
  },
  subscriptions: async (t) => {
    const rows = await prisma.subscription.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" } });
    return rows.map((s) => ({ id: s.id, userId: s.userId, tierId: s.tierId, status: s.status, stripeSubscriptionId: s.stripeSubscriptionId, createdAt: s.createdAt }));
  },
  posts: async (t) => {
    const rows = await prisma.post.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" } });
    return rows.map((p) => ({ id: p.id, spaceId: p.spaceId, authorId: p.authorId, title: p.title, body: p.body, isPublished: p.isPublished, createdAt: p.createdAt }));
  },
  comments: async (t) => {
    const rows = await prisma.comment.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" } });
    return rows.map((c) => ({ id: c.id, postId: c.postId, parentId: c.parentId, authorId: c.authorId, body: c.body, createdAt: c.createdAt }));
  },
  products: async (t) => {
    const rows = await prisma.product.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" } });
    return rows.map((p) => ({ id: p.id, name: p.name, type: p.type, priceCents: p.priceCents, currency: p.currency, stock: p.stock, requiresShipping: p.requiresShipping, isPublished: p.isPublished, createdAt: p.createdAt }));
  },
  courses: async (t) => {
    const rows = await prisma.course.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" } });
    return rows.map((c) => ({ id: c.id, spaceId: c.spaceId, title: c.title, format: c.format, isPublished: c.isPublished, createdAt: c.createdAt }));
  },
  events: async (t) => {
    const rows = await prisma.event.findMany({ where: { tenantId: t }, orderBy: { startsAt: "asc" } });
    return rows.map((e) => ({ id: e.id, spaceId: e.spaceId, title: e.title, startsAt: e.startsAt, location: e.location, isOnline: e.isOnline, capacity: e.capacity, createdAt: e.createdAt }));
  },
  campaigns: async (t) => {
    const rows = await prisma.newsletterCampaign.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" } });
    return rows.map((c) => ({ id: c.id, subject: c.subject, status: c.status, recipientCount: c.recipientCount, segmentId: c.segmentId, sentAt: c.sentAt, createdAt: c.createdAt }));
  },
  segments: async (t) => {
    const rows = await prisma.segment.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" } });
    return rows.map((s) => ({ id: s.id, name: s.name, createdAt: s.createdAt }));
  },
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set<string>()));
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  return "﻿" + lines.join("\r\n");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  // CSRF hardening: this PII export must never be triggerable cross-site.
  // Browsers send Sec-Fetch-Site on all requests; "cross-site" is rejected
  // ("same-origin"/"none" = direct navigation/download stay allowed).
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (!membership || !roleAtLeast(membership.role, "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const t = tenant.id;
  const url = new URL(req.url);
  const dataset = url.searchParams.get("dataset");
  const format = (url.searchParams.get("format") || "json").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);

  // Single dataset export (CSV or JSON).
  if (dataset) {
    const loader = DATASETS[dataset];
    if (!loader) return NextResponse.json({ error: "Unbekannter Datensatz." }, { status: 400 });
    const rows = await loader(t);
    if (format === "csv") {
      return new NextResponse(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="aera-${slug}-${dataset}-${stamp}.csv"`,
        },
      });
    }
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="aera-${slug}-${dataset}-${stamp}.json"`,
      },
    });
  }

  // Full export: every dataset in one JSON bundle.
  const keys = Object.keys(DATASETS);
  const results = await Promise.all(keys.map((k) => DATASETS[k](t)));
  const data: Record<string, Row[]> = {};
  keys.forEach((k, i) => { data[k] = results[i]; });

  const payload = {
    exportedAt: new Date().toISOString(),
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    counts: Object.fromEntries(keys.map((k, i) => [k, results[i].length])),
    data,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="aera-export-${slug}-${stamp}.json"`,
    },
  });
}
