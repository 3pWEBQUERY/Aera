import "server-only";
import { systemPrisma as prisma } from "./prisma";
import { features } from "./env";
import { sendEmail, renderAccountActionHtml } from "./email";
import { signAccountToken, verifyUrl } from "./tokens";
import type { User } from "@/app/generated/prisma/client";
import { getLocale } from "next-intl/server";
import { emailTranslator, resolveEmailLocale } from "./email-i18n";

/**
 * E-Mail-Verifizierung (Double-Opt-in-Baustein).
 *
 * Der Link nutzt die stateless Account-Tokens aus lib/tokens.ts: kein
 * Token-Table nötig, ein Passwortwechsel invalidiert alte Links. Zusätzlich
 * gelten Invite-Annahme und abgeschlossener Passwort-Reset als Nachweis der
 * Mailbox-Kontrolle und setzen `emailVerifiedAt` ebenfalls.
 */

const TOKEN_TTL = "48h";

export async function sendVerificationEmail(
  user: Pick<User, "id" | "email" | "name" | "passwordHash" | "locale">,
): Promise<void> {
  const token = await signAccountToken(user, "verify", TOKEN_TTL);
  const url = verifyUrl(token);
  // Sprache des Kontos; ohne gespeicherte Sprache die des Requests (bei der
  // Registrierung ist das dieselbe).
  const locale = resolveEmailLocale(user.locale, await getLocale());
  const t = await emailTranslator(locale);

  if (!features.email) {
    // Dev ohne Mail-Provider: Link in der Server-Konsole ausgeben.
    console.info(`[aera] Verifizierungs-Link für ${user.email}: ${url}`);
    return;
  }
  await sendEmail({
    to: user.email,
    subject: t("verifySubject"),
    html: renderAccountActionHtml({
      locale,
      title: t("verifySubject"),
      heading: t("verifyHeading"),
      body: t("verifyBody", { name: user.name }),
      ctaLabel: t("verifyCta"),
      ctaUrl: url,
      hint: t("verifyHint"),
      fallbackLabel: t("fallbackLink"),
      footerLabel: t("sentVia"),
    }),
  });
}

/** Markiert den Nutzer als verifiziert (idempotent). */
export async function markEmailVerified(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
}
