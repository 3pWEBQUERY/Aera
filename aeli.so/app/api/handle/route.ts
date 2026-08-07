import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { normalizeHandle, handleSuggestions } from "@/lib/handle";
import { freeHandles, handleStatus, HANDLE_PROBLEM_TEXT } from "@/lib/handle-availability";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { profileUrlLabel } from "@/lib/url";

/**
 * „Ist dieser Handle noch frei?“ — für die Live-Rückmeldung im Onboarding.
 *
 * Nur für Angemeldete. Sonst wäre das ein bequemes Werkzeug, um die komplette
 * Handle-Liste abzugrasen: 30 Zeichen, überschaubarer Zeichenvorrat, und man
 * wüsste, welche Namen belegt sind, bevor man ein Konto anlegt.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!rateLimit(`handle:${clientIp(request.headers)}`, 60, 60_000).ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const raw = new URL(request.url).searchParams.get("h") ?? "";
  const handle = normalizeHandle(raw);
  const status = await handleStatus(handle);

  return NextResponse.json(
    {
      handle,
      preview: profileUrlLabel(handle || "deinname"),
      available: status.ok,
      reason: status.ok ? null : HANDLE_PROBLEM_TEXT[status.reason],
      // Vorschläge nur, wenn der Wunsch weg ist. Vorschläge neben einem freien
      // Handle sähen aus, als wäre mit dem eigenen etwas nicht in Ordnung.
      suggestions: status.ok ? [] : await freeHandles(handleSuggestions(handle || raw)),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
