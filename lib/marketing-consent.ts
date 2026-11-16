import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { FOOTER_SLOT, OUTSIDE_TEXT } from "./email";
import { pickSupportedLocale, resolveEmailLocale } from "./email-i18n";
import type { AppLocale } from "@/i18n/locales";
import prisma, {
  systemPrisma,
  withTenantContext,
  withTenantTransactionFor,
} from "./prisma";
import type {
  EmailSuppressionReason,
  Prisma,
} from "@/app/generated/prisma/client";

const TOKEN_VERSION = 1;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type MarketingDeliveryKind = "newsletter" | "automation";

interface UnsubscribePayload {
  v: 1;
  d: string;
  t: string;
  u: string;
  k: MarketingDeliveryKind;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signature(encodedPayload: string): string {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`aera-newsletter-unsubscribe.${encodedPayload}`)
    .digest("base64url");
}

export function createNewsletterUnsubscribeToken(input: {
  deliveryId: string;
  tenantId: string;
  userId: string;
  kind: MarketingDeliveryKind;
}): string {
  const payload: UnsubscribePayload = {
    v: TOKEN_VERSION,
    d: input.deliveryId,
    t: input.tenantId,
    u: input.userId,
    k: input.kind,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

function parseNewsletterUnsubscribeToken(token: string): UnsubscribePayload | null {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return null;
  const expected = signature(encoded);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<UnsubscribePayload>;
    if (
      payload.v !== TOKEN_VERSION ||
      typeof payload.d !== "string" ||
      typeof payload.t !== "string" ||
      typeof payload.u !== "string" ||
      (payload.k !== "newsletter" && payload.k !== "automation")
    ) {
      return null;
    }
    return payload as UnsubscribePayload;
  } catch {
    return null;
  }
}

export function newsletterUnsubscribeUrls(input: {
  deliveryId: string;
  tenantId: string;
  userId: string;
  kind: MarketingDeliveryKind;
}): { apiUrl: string; pageUrl: string } {
  const token = createNewsletterUnsubscribeToken(input);
  const origin = env.APP_URL.replace(/\/$/, "");
  const encoded = encodeURIComponent(token);
  return {
    apiUrl: `${origin}/api/newsletter/unsubscribe/${encoded}`,
    pageUrl: `${origin}/unsubscribe/${encoded}`,
  };
}

/**
 * Fußzeile jeder Marketing-Mail: Grund der Zustellung und Abmeldelink in der
 * Sprache des Empfängers. Sitzt in unseren Vorlagen im Mail-Rahmen
 * (FOOTER_SLOT), bei Creator-HTML vor `</body>` bzw. am Ende.
 *
 * Ein String als drittes Argument gilt als reiner Linktext (Altaufrufer).
 */
export function appendUnsubscribeFooter(
  html: string,
  pageUrl: string,
  copy: string | { label: string; reason?: string } = "Unsubscribe",
): string {
  const { label, reason } = typeof copy === "string" ? { label: copy, reason: undefined } : copy;
  // Eigener Hintergrund: Creator-HTML kann dunkel sein, der Kontrast muss trotzdem stimmen.
  const style = `margin:16px auto 0;max-width:560px;padding:8px 12px;background:#f3f4f6;border-radius:8px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${OUTSIDE_TEXT}`;
  const reasonHtml = reason ? `${escapeHtml(reason)}<br/>` : "";
  const footer = `<p style="${style}">${reasonHtml}<a href="${escapeHtml(pageUrl)}" style="color:${OUTSIDE_TEXT};text-decoration:underline">${escapeHtml(label)}</a></p>`;
  if (html.includes(FOOTER_SLOT)) return html.replace(FOOTER_SLOT, () => footer);
  // Letztes </body>: ein früheres könnte in verstecktem Creator-Markup stehen.
  const bodyEnd = html.toLowerCase().lastIndexOf("</body>");
  return bodyEnd >= 0
    ? `${html.slice(0, bodyEnd)}${footer}${html.slice(bodyEnd)}`
    : `${html}${footer}`;
}

/**
 * Gespeicherte Sprache der Empfänger und des Community-Inhabers. `locale`
 * liegt bewusst nicht im Spalten-Grant von aera_app, daher der privilegierte
 * Client — nur für Ids, die die RLS-Abfrage davor schon geliefert hat.
 */
export async function marketingRecipientLocales(
  tenantId: string,
  userIds: string[],
): Promise<{ byUser: Map<string, AppLocale>; fallback: AppLocale }> {
  const [users, tenant] = await Promise.all([
    userIds.length > 0
      ? systemPrisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, locale: true },
        })
      : Promise.resolve([]),
    systemPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { owner: { select: { locale: true } } },
    }),
  ]);
  const byUser = new Map<string, AppLocale>();
  for (const user of users ?? []) {
    const locale = pickSupportedLocale(user.locale);
    if (locale) byUser.set(user.id, locale);
  }
  return { byUser, fallback: resolveEmailLocale(tenant?.owner?.locale) };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function optInToNewsletter(input: {
  tenantId: string;
  userId: string;
  email: string;
  source: string;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) throw new Error("A valid email address is required");
  const now = new Date();
  await withTenantTransactionFor(input.tenantId, async (tx) => {
    const previous = await tx.newsletterConsent.findUnique({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
    });
    const consent = await tx.newsletterConsent.upsert({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
      create: {
        tenantId: input.tenantId,
        userId: input.userId,
        email,
        status: "OPTED_IN",
        optedInAt: now,
        optedInSource: input.source,
      },
      update: {
        email,
        status: "OPTED_IN",
        optedInAt: previous?.status === "OPTED_IN" && previous.email === email
          ? previous.optedInAt
          : now,
        optedInSource: previous?.status === "OPTED_IN" && previous.email === email
          ? previous.optedInSource
          : input.source,
        withdrawnAt: null,
        withdrawnSource: null,
      },
    });
    if (previous?.status !== "OPTED_IN" || previous.email !== email) {
      await tx.newsletterConsentEvent.create({
        data: {
          tenantId: input.tenantId,
          consentId: consent.id,
          userId: input.userId,
          email,
          type: "OPTED_IN",
          source: input.source,
        },
      });
    }
    // A fresh explicit opt-in may lift only a previous unsubscribe. Bounce,
    // complaint and manual suppressions remain active for operational review.
    await tx.emailSuppression.updateMany({
      where: {
        tenantId: input.tenantId,
        email,
        reason: "UNSUBSCRIBED",
        liftedAt: null,
      },
      data: { liftedAt: now },
    });
  });
}

export async function withdrawNewsletterConsent(input: {
  tenantId: string;
  userId: string;
  email: string;
  source: string;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) throw new Error("A valid email address is required");
  const now = new Date();
  await withTenantTransactionFor(input.tenantId, async (tx) => {
    const previous = await tx.newsletterConsent.findUnique({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
    });
    const consent = await tx.newsletterConsent.upsert({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
      create: {
        tenantId: input.tenantId,
        userId: input.userId,
        email,
        status: "WITHDRAWN",
        withdrawnAt: now,
        withdrawnSource: input.source,
      },
      update: {
        email,
        status: "WITHDRAWN",
        withdrawnAt: previous?.status === "WITHDRAWN" && previous.email === email
          ? previous.withdrawnAt
          : now,
        withdrawnSource: previous?.status === "WITHDRAWN" && previous.email === email
          ? previous.withdrawnSource
          : input.source,
      },
    });
    if (previous?.status !== "WITHDRAWN" || previous.email !== email) {
      await tx.newsletterConsentEvent.create({
        data: {
          tenantId: input.tenantId,
          consentId: consent.id,
          userId: input.userId,
          email,
          type: "WITHDRAWN",
          source: input.source,
        },
      });
    }
    await tx.emailSuppression.upsert({
      where: {
        tenantId_email_reason: {
          tenantId: input.tenantId,
          email,
          reason: "UNSUBSCRIBED",
        },
      },
      create: {
        tenantId: input.tenantId,
        userId: input.userId,
        email,
        reason: "UNSUBSCRIBED",
        source: input.source,
        suppressedAt: now,
      },
      update: {
        userId: input.userId,
        source: input.source,
        suppressedAt: now,
        liftedAt: null,
      },
    });
  });
}

export async function suppressMarketingEmail(input: {
  tenantId: string;
  userId?: string | null;
  email: string;
  reason: Extract<EmailSuppressionReason, "BOUNCE" | "COMPLAINT" | "MANUAL">;
  source: string;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) return;
  await withTenantContext(input.tenantId, async () => {
    await prisma.emailSuppression.upsert({
      where: {
        tenantId_email_reason: {
          tenantId: input.tenantId,
          email,
          reason: input.reason,
        },
      },
      create: {
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        email,
        reason: input.reason,
        source: input.source,
      },
      update: {
        userId: input.userId ?? undefined,
        source: input.source,
        suppressedAt: new Date(),
        liftedAt: null,
      },
    });
  });
}

export async function isNewsletterRecipientEligible(input: {
  tenantId: string;
  userId: string;
  email: string;
}): Promise<boolean> {
  const email = normalizeEmail(input.email);
  return withTenantContext(input.tenantId, async () => {
    const consent = await prisma.newsletterConsent.findUnique({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
      select: {
        email: true,
        status: true,
        user: {
          select: {
            email: true,
            emailVerifiedAt: true,
            memberships: {
              where: { tenantId: input.tenantId, status: "ACTIVE" },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (
      !consent ||
      consent.status !== "OPTED_IN" ||
      normalizeEmail(consent.email) !== email ||
      normalizeEmail(consent.user.email) !== email ||
      !consent.user.emailVerifiedAt ||
      consent.user.memberships.length === 0
    ) {
      return false;
    }
    const suppressions = await prisma.emailSuppression.count({
      where: { tenantId: input.tenantId, email, liftedAt: null },
    });
    return suppressions === 0;
  });
}

async function resolveTokenDelivery(payload: UnsubscribePayload) {
  const select = {
    tenantId: true,
    userId: true,
    recipientEmail: true,
    tenant: { select: { name: true } },
  } satisfies Prisma.NewsletterDeliverySelect;
  if (payload.k === "newsletter") {
    return systemPrisma.newsletterDelivery.findFirst({
      where: { id: payload.d, tenantId: payload.t, userId: payload.u },
      select,
    });
  }
  return systemPrisma.automationDelivery.findFirst({
    where: { id: payload.d, tenantId: payload.t, userId: payload.u },
    select,
  });
}

export async function getNewsletterUnsubscribeContext(token: string): Promise<{
  tenantName: string;
} | null> {
  const payload = parseNewsletterUnsubscribeToken(token);
  if (!payload) return null;
  const delivery = await resolveTokenDelivery(payload);
  return delivery ? { tenantName: delivery.tenant.name } : null;
}

export async function withdrawNewsletterConsentByToken(
  token: string,
  source: string,
): Promise<boolean> {
  const payload = parseNewsletterUnsubscribeToken(token);
  if (!payload) return false;
  const delivery = await resolveTokenDelivery(payload);
  if (!delivery) return false;
  await withdrawNewsletterConsent({
    tenantId: delivery.tenantId,
    userId: delivery.userId,
    email: delivery.recipientEmail,
    source,
  });
  return true;
}
