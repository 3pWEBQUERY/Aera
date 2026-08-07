import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { aeliHandleTaken } from "@/lib/aeli";
import { normalizeHandle, checkHandle } from "@/lib/aeli-handle";

/**
 * „Ist dieser Aeli-Handle noch frei?" — für die Live-Rückmeldung im
 * Integrationen-Reiter.
 *
 * Nur für Angemeldete, aus demselben Grund wie das Gegenstück auf aeli.so:
 * sonst wäre das ein bequemes Werkzeug, um die komplette Handle-Liste
 * abzugrasen. Zurück kommt ja oder nein, nie ein fremdes Profil.
 */
export async function GET(request: Request) {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const handle = normalizeHandle(new URL(request.url).searchParams.get("h") ?? "");
  const available = checkHandle(handle) === null && !(await aeliHandleTaken(handle));

  return NextResponse.json({ handle, available }, { headers: { "Cache-Control": "no-store" } });
}
