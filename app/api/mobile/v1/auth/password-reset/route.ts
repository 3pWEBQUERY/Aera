import { z } from "zod";
import prisma from "@/lib/prisma";
import { features } from "@/lib/env";
import { signAccountToken, resetUrl } from "@/lib/tokens";
import { sendEmail, renderAccountActionHtml } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { jsonError, jsonOk, parseJsonBody, requestIp } from "@/lib/mobile/api";

// POST /api/mobile/v1/auth/password-reset  { email } → { ok: true }
// Antwortet immer identisch (keine E-Mail-Enumeration). Logik gespiegelt aus
// app/actions/account.ts (requestPasswordResetAction) — dort hängt der Text an
// next-intl, deshalb hier feste deutsche Mail-Texte.

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const ip = requestIp(req);
  if (!(await rateLimit(`reset:${ip}`, 5, 15 * 60 * 1000))) {
    return jsonError("rate_limited", "Too many requests. Try again later.", 429);
  }

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await signAccountToken(user, "reset", "1h");
    const url = resetUrl(token);
    if (features.email) {
      await sendEmail({
        to: user.email,
        subject: "Passwort zurücksetzen",
        html: renderAccountActionHtml({
          heading: "Passwort zurücksetzen",
          body: `Hallo ${user.name}, über den Button unten kannst du ein neues Passwort festlegen.`,
          ctaLabel: "Neues Passwort festlegen",
          ctaUrl: url,
          hint: "Der Link ist 60 Minuten gültig. Wenn du das nicht angefordert hast, ignoriere diese E-Mail.",
          fallbackLabel: "Oder öffne diesen Link:",
          footerLabel: "Gesendet über Aera",
        }),
      });
    } else {
      // Dev ohne Mail-Provider: Link in der Server-Konsole ausgeben.
      console.info(`[aera] Passwort-Reset-Link für ${user.email}: ${url}`);
    }
    await writeAudit({ actorUserId: user.id, action: "user.password_reset.request" });
  }
  return jsonOk({ ok: true });
}
