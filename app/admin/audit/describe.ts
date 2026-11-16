/**
 * Audit-Log in Klartext.
 *
 * Jeder Eintrag wird zu einem Satz aus `admin.audit.events.<id>` (Akteur im
 * Satz), ergaenzt um das Ziel und die Community. Die Rohdaten (Schluessel,
 * IDs, Metadaten) bleiben aufklappbar fuer den Notfall.
 *
 * Neue `writeAudit({ action })`-Schluessel gehoeren in AUDIT_EVENT_KEYS und
 * nach messages/*.json — der Test tests/admin-audit-describe.test.ts prueft
 * beides. Unbekannte Schluessel bekommen einen lesbaren Fallback.
 */

export const AUDIT_EVENT_KEYS = [
  "admin.blog.create",
  "admin.blog.update",
  "admin.blog.publish",
  "admin.blog.unpublish",
  "admin.blog.delete",
  "admin.blog.duplicate",
  "admin.blog.feature",
  "admin.blog.unfeature",
  "admin.help.article.create",
  "admin.help.article.update",
  "admin.help.article.delete",
  "admin.help.category.create",
  "admin.help.category.update",
  "admin.help.category.delete",
  "admin.media.delete",
  "admin.order.delete",
  "admin.order.update",
  "admin.post.delete",
  "admin.post.publish",
  "admin.post.unpublish",
  "admin.promo.create",
  "admin.promo.delete",
  "admin.promo.activate",
  "admin.promo.pause",
  "admin.seo.update",
  "admin.tenant.delete.blocked",
  "admin.tenant.delete.queued",
  "admin.tenant.plan",
  "admin.tenant.update",
  "admin.tenant.suspend",
  "admin.tenant.activate",
  "admin.tenant.domain.verify",
  "admin.tenant.domain.unverified",
  "admin.user.delete.queued",
  "admin.user.reset_link",
  "admin.user.update",
  "aeli.link_code_issued",
  "aeli.linked",
  "aeli.page_created",
  "aeli.unlinked",
  "announcement.create",
  "announcement.update",
  "announcement.delete",
  "apikey.create",
  "apikey.revoke",
  "apple.iap.refunded",
  "apple.iap.tier",
  "apple.iap.product",
  "apple.iap.post",
  "apple.iap.media",
  "apple.iap.media-item",
  "apple.iap.tip",
  "apple.iap.request",
  "apple.iap.booking",
  "automation.step.create",
  "automation.step.delete",
  "branding.cover.set",
  "branding.cover.remove",
  "campaign.delete",
  "campaign.queue",
  "chatMessage.delete",
  "comment.delete",
  "course.delete",
  "course.update",
  "creator.checkout.failed",
  "event.delete",
  "event.update",
  "live.create",
  "live.start",
  "live.status",
  "media.delete",
  "member.add",
  "member.join",
  "member.remove",
  "member.remove.blocked",
  "member.update",
  "member.ban",
  "member.update.blocked",
  "membership.cancel",
  "membership.cancel.failed",
  "membership.leave",
  "membership.leave.blocked",
  "moderation.approve",
  "moderation.remove",
  "newsletter.consent.opt_in",
  "newsletter.consent.withdraw",
  "order.fulfill",
  "page.create",
  "page.delete",
  "plan.create",
  "plan.promo.redeem",
  "platform_admin.create_user",
  "platform_admin.verify_email",
  "platform_admin.grant",
  "platform_admin.revoke",
  "product.delete",
  "product.delete.blocked",
  "product.update",
  "profile.update",
  "referrals.settings.update",
  "space.ad.create",
  "space.ad.update",
  "space.ad.delete",
  "space.announcementsOnly.enable",
  "space.announcementsOnly.disable",
  "space.archive",
  "space.restore",
  "space.chatSettings.update",
  "space.create",
  "space.create.assistant",
  "space.delete",
  "space.link.create",
  "space.link.update",
  "space.link.delete",
  "space.storySettings.update",
  "space.update",
  "stripe.charge.partially_refunded",
  "stripe.charge.refunded",
  "stripe.checkout.auto_refunded",
  "stripe.checkout.completed",
  "stripe.dispute.created",
  "stripe.dispute.lost",
  "stripe.dispute.won",
  "stripe.product_reservation.released",
  "support.ticket.create",
  "support.ticket.reply",
  "tenant.create",
  "tenant.delete.blocked",
  "tenant.delete.queued",
  "tenant.domain",
  "tenant.domain.unverified",
  "tenant.domain.verify",
  "tenant.seo.update",
  "tenant.stripe.disconnect",
  "tenant.stripe.disconnect.blocked",
  "tenant.subdomain",
  "tier.delete",
  "tier.delete.blocked",
  "tier.update",
  "user.delete.queued",
  "user.invite.accept",
  "user.legal.accept",
  "user.password.change",
  "user.password_reset.complete",
  "user.password_reset.request",
  "user.profile.update",
  "user.signup",
  "user.totp.disable",
  "user.totp.enable",
  "user.totp.recovery_code_used",
  "user.totp.recovery_codes.regenerate",
  "user.verification.resend",
  "webhook.create",
  "webhook.delete",
] as const;

export type AuditEventKey = (typeof AUDIT_EVENT_KEYS)[number];

const KNOWN = new Set<string>(AUDIT_EVENT_KEYS);

/** Message-ID unter `admin.audit.events` (next-intl trennt Pfade an Punkten). */
export function auditMessageId(key: string): string {
  return key.replace(/[.-]/g, "_");
}

type Meta = Record<string, unknown>;

export function asMeta(metadata: unknown): Meta {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Meta)
    : {};
}

/**
 * Welcher Satz zu einem Eintrag passt. Einige generische Schluessel werden
 * anhand der Metadaten genauer (eine Sperre ist ein „member.update" mit
 * Status BANNED). `null` = unbekannter Schluessel → Fallback.
 */
export function auditEventKey(action: string, metadata: unknown): AuditEventKey | null {
  const meta = asMeta(metadata);
  if (action === "member.update" && meta.status === "BANNED") return "member.ban";
  if (action === "admin.tenant.update" && meta.statusChanged === true) {
    if (meta.status === "SUSPENDED") return "admin.tenant.suspend";
    if (meta.status === "ACTIVE") return "admin.tenant.activate";
  }
  if (action === "admin.blog.feature" && meta.featured === false) return "admin.blog.unfeature";
  return KNOWN.has(action) ? (action as AuditEventKey) : null;
}

/** „tenant.delete.queued" → „tenant › delete › queued" fuer den Fallback. */
export function humanizeAction(action: string): string {
  return action
    .split(".")
    .map((part) =>
      part
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .join(" › ");
}

/** Ziel-Bezeichnung aus den Metadaten, wenn die Datenbank nichts (mehr) liefert. */
export function targetFromMetadata(metadata: unknown): string | null {
  const meta = asMeta(metadata);
  for (const field of ["name", "title", "subject", "email", "domain", "subdomain", "code", "label"]) {
    const value = meta[field];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
  }
  return null;
}

/** Hat der Eintrag Rohdaten, die man aufklappen kann? */
export function hasDetails(entry: {
  metadata: unknown;
  targetType: string | null;
  targetId: string | null;
}): boolean {
  return Object.keys(asMeta(entry.metadata)).length > 0 || Boolean(entry.targetType || entry.targetId);
}
