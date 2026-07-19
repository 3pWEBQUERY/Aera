import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import prisma from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";
import { env } from "@/lib/env";

function notFound() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

function authorized(request: Request): boolean {
  if (process.env.NODE_ENV === "production" || env.QA_LOGIN_SECRET.length < 32) {
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = Buffer.from(env.QA_LOGIN_SECRET);
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Local/CI-only escape hatch. It is deliberately POST-only, disabled in every
 * production build and protected by a separate high-entropy bearer secret.
 * Public preview deployments therefore cannot inherit a convenient QA login.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return notFound();
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const tenant = await prisma.tenant.findUnique({
    where: { slug, status: "ACTIVE" },
    select: { owner: { select: { id: true, sessionVersion: true } } },
  });
  if (!tenant) return notFound();
  await setSessionCookie({
    userId: tenant.owner.id,
    sessionVersion: tenant.owner.sessionVersion,
  });
  return NextResponse.redirect(new URL(`/dashboard/${slug}/media`, request.url));
}

export async function GET() {
  return notFound();
}
