import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import prisma, { setTenantContext, systemPrisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";
import { sessionMatchesUser } from "@/lib/auth";
import type { Tenant, User } from "@/app/generated/prisma/client";

/**
 * Gemeinsamer Rahmen für alle /api/mobile/v1-Routen: Bearer-Auth (dasselbe
 * HS256-JWT wie das Web-Session-Cookie inkl. sessionVersion-Abgleich),
 * einheitliches Fehlerformat, Cursor-Pagination und Zod-Body-Validierung.
 * Fehlerformat/Pagination-Stil nach dem Vorbild von lib/public-api.ts.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonOk(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: NO_STORE },
  );
}

// ---------------------------------------------------------------- Auth
/**
 * Bearer-Token → User. Validierung exakt wie lib/session.ts (HS256, AUTH_SECRET)
 * inkl. sessionVersion-Abgleich, damit Passwortwechsel alte Tokens invalidiert.
 */
export async function mobileAuth(req: Request): Promise<User | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const session = await verifySession(match[1]!.trim());
  if (!session) return null;
  const user = await systemPrisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !sessionMatchesUser(session, user)) return null;
  return user;
}

/** Wie mobileAuth, liefert bei fehlendem/ungültigem Token direkt die 401-Antwort. */
export async function requireMobileAuth(
  req: Request,
): Promise<{ user: User } | { response: NextResponse }> {
  const user = await mobileAuth(req);
  if (!user) {
    return { response: jsonError("unauthorized", "Missing or invalid bearer token.", 401) };
  }
  return { user };
}

// ---------------------------------------------------------------- Tenant
/** Tenant per Slug auflösen und den RLS-Tenant-Kontext aktivieren. */
export async function resolveTenant(slug: string): Promise<Tenant | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug, status: "ACTIVE" },
  });
  if (tenant) setTenantContext(tenant.id);
  return tenant;
}

// ---------------------------------------------------------------- Pagination
export interface CursorPagination {
  limit: number;
  cursor: string | null;
}

/** ?limit= (Default 30, max 100) & ?cursor= (ID des letzten Elements). */
export function cursorPagination(req: Request, defaultLimit = 30): CursorPagination {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || defaultLimit, 1),
    100,
  );
  const cursor = url.searchParams.get("cursor");
  return { limit, cursor: cursor && cursor.trim() ? cursor.trim() : null };
}

/** Auf `limit + 1` Zeilen angewandt: Seite + nextCursor (ID des letzten Elements). */
export function paginate<T extends { id: string }>(
  rows: T[],
  limit: number,
): { page: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

// ---------------------------------------------------------------- Body-Validierung
/**
 * JSON-Body lesen und mit Zod validieren. Bei Fehlern kommt eine fertige
 * 400-Antwort mit Code "validation" zurück.
 */
export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ data: z.infer<S> } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: jsonError("validation", "Request body must be valid JSON.", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.join(".") ?? "";
    return {
      response: jsonError(
        "validation",
        `${path ? `${path}: ` : ""}${first?.message ?? "Invalid request body."}`,
        400,
      ),
    };
  }
  return { data: parsed.data };
}

/** Best-effort Client-IP für Rate-Limit-Keys (Request-basiert, ohne next/headers). */
export function requestIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}
