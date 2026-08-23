import "server-only";
import { getTranslations } from "next-intl/server";
import { systemPrisma } from "./prisma";
import { env } from "./env";
import { sendEmail, renderSupportHtml } from "./email";
import { normalizeLocale } from "@/i18n/locales";

/**
 * E-Mail rund um Support-Tickets.
 *
 * Alles hier ist "best effort": eine Störung beim Mail-Anbieter darf niemals
 * die Antwort selbst scheitern lassen. Der Verlauf steht ohnehin in der App —
 * die Mail ist der Anstoß, nicht der Inhalt.
 */

const APP = env.APP_URL.replace(/\/+$/, "");

/** Die Antwort geht an die Sprache, in der uns die Person geschrieben hat. */
async function ticketTranslator(locale: string | null) {
  return getTranslations({
    locale: normalizeLocale(locale ?? undefined),
    namespace: "ui.emails",
  });
}

/**
 * Unsere Antwort an den Absender. Mitglieder bekommen den Weg in ihren
 * Verlauf, Gäste den zum Kontaktformular — sie haben keinen Zugang zum Thread
 * und sollen trotzdem antworten können.
 */
export async function notifyTicketReply(input: {
  ticketId: string;
  messageId: string;
}): Promise<void> {
  try {
    const ticket = await systemPrisma.supportTicket.findUnique({
      where: { id: input.ticketId },
      select: {
        id: true,
        email: true,
        subject: true,
        locale: true,
        userId: true,
        messages: {
          // Genau die eine Antwort, um die es geht — nicht "die neueste".
          where: { id: input.messageId, fromStaff: true },
          select: { id: true, body: true },
        },
      },
    });
    const message = ticket?.messages[0];
    if (!ticket || !message) return;

    const t = await ticketTranslator(ticket.locale);
    const isMember = ticket.userId !== null;

    await sendEmail({
      to: ticket.email,
      subject: t("supportReplySubject", { subject: ticket.subject }),
      // Ein Ticket kann mehrfach beantwortet werden, eine einzelne Nachricht
      // aber nur einmal — die Nachricht-Id ist der richtige Schlüssel.
      idempotencyKey: `support-reply-${message.id}`,
      html: renderSupportHtml({
        heading: t("supportReplyHeading"),
        intro: t("supportReplyIntro"),
        subjectLabel: t("supportSubjectLabel"),
        subject: ticket.subject,
        message: message.body,
        ctaLabel: isMember ? t("supportReplyCtaMember") : t("supportReplyCtaGuest"),
        ctaUrl: isMember
          ? `${APP}/member/account?tab=support&from=/dashboard`
          : `${APP}/hilfe/kontakt`,
        hint: isMember ? t("supportReplyHintMember") : t("supportReplyHintGuest"),
        footerLabel: t("sentVia"),
      }),
    });
  } catch {
    // Bewusst geschluckt: siehe Kopf der Datei.
  }
}

/**
 * Eingang beim Team. Ohne das würde eine Anfrage erst gesehen, wenn zufällig
 * jemand den Admin-Bereich öffnet.
 */
export async function notifyTeamOfInbound(input: {
  ticketId: string;
  messageId: string;
  isNewTicket: boolean;
}): Promise<void> {
  try {
    const recipients = env.PLATFORM_ADMIN_EMAILS;
    if (recipients.length === 0) return;

    const ticket = await systemPrisma.supportTicket.findUnique({
      where: { id: input.ticketId },
      select: { subject: true, email: true, name: true },
    });
    const message = await systemPrisma.supportMessage.findUnique({
      where: { id: input.messageId },
      select: { body: true },
    });
    if (!ticket || !message) return;

    // Das Team arbeitet in der Standardsprache der Plattform.
    const t = await getTranslations({
      locale: normalizeLocale(undefined),
      namespace: "ui.emails",
    });
    const from = ticket.name ? `${ticket.name} <${ticket.email}>` : ticket.email;

    await Promise.all(
      recipients.map((to) =>
        sendEmail({
          to,
          subject: t(
            input.isNewTicket ? "supportInboundSubjectNew" : "supportInboundSubjectReply",
            { subject: ticket.subject },
          ),
          idempotencyKey: `support-inbound-${input.messageId}-${to}`,
          html: renderSupportHtml({
            heading: t("supportInboundHeading", { from }),
            intro: t("supportInboundIntro"),
            subjectLabel: t("supportSubjectLabel"),
            subject: ticket.subject,
            message: message.body,
            ctaLabel: t("supportInboundCta"),
            ctaUrl: `${APP}/admin/support`,
            hint: t("supportInboundHint", { email: ticket.email }),
            footerLabel: t("sentVia"),
          }),
        }),
      ),
    );
  } catch {
    /* best effort */
  }
}
