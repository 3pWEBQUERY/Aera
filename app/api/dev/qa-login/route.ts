import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { owner: { select: { id: true, sessionVersion: true } } },
  });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await setSessionCookie({
    userId: tenant.owner.id,
    sessionVersion: tenant.owner.sessionVersion,
  });
  return NextResponse.redirect(new URL(`/dashboard/${slug}/media`, request.url));
}
