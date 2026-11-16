import { z } from "zod";
import prisma from "@/lib/prisma";
import { features } from "@/lib/env";
import { signAccountToken, resetUrl } from "@/lib/tokens";
import { sendEmail, renderAccountActionHtml } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { jsonError, jsonOk, parseJsonBody, requestIp } from "@/lib/mobile/api";
import {
  emailTranslator,
  localeFromMobileRequest,
  resolveEmailLocale,
} from "@/lib/email-i18n";

// POST /api/mobile/v1/auth/password-reset  { email, locale? } → { ok: true }
// Antwortet immer identisch (keine E-Mail-Enumeration). Logik gespiegelt aus
// app/actions/account.ts (requestPasswordResetAction), gleiche Vorlage
// `ui.emails.reset*`. Sprache: die des Kontos, sonst Body-`locale`, sonst
// Accept-Language, sonst Deutsch.

const schema = z.object({
  email: z.string().email(),
  locale: z.string().max(35).nullish(),
});

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
      const locale = resolveEmailLocale(
        user.locale,
        localeFromMobileRequest(req, parsed.data.locale),
      );
      const t = await emailTranslator(locale);
      await sendEmail({
        to: user.email,
        subject: t("resetSubject"),
        html: renderAccountActionHtml({
          locale,
          title: t("resetSubject"),
          heading: t("resetHeading"),
          body: t("resetBody", { name: user.name }),
          ctaLabel: t("resetCta"),
          ctaUrl: url,
          hint: t("resetHint"),
          fallbackLabel: t("fallbackLink"),
          footerLabel: t("sentVia"),
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
