"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import prisma, { systemPrisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, getCurrentUser } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { features } from "@/lib/env";
import { sendEmail, renderAccountActionHtml } from "@/lib/email";
import { signAccountToken, verifyAccountToken, resetUrl } from "@/lib/tokens";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import {
  decryptSecret,
  encryptSecret,
  secretNeedsRotation,
} from "@/lib/secret-encryption";
import { getErrorTranslator, type ErrorT } from "@/lib/action-errors";
import { getTranslations } from "next-intl/server";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  LEGAL_DOCUMENT,
} from "@/lib/legal";

export interface AccountState {
  error?: string;
  ok?: boolean;
}

function safeNextPath(value: FormDataEntryValue | null, fallback = "/home") {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}

const PASSWORD_MIN = 8;

/** Prüft ein Passwort und gibt bei Bedarf einen übersetzten Fehlertext zurück. */
function validPassword(pw: string, t: ErrorT): string | null {
  if (pw.length < PASSWORD_MIN) return t("passwordTooShort", { min: PASSWORD_MIN });
  if (pw.length > 200) return t("passwordTooLong");
  return null;
}

/**
 * Password reset request — always answers identically so e-mail addresses
 * cannot be enumerated. Without a configured mail provider (dev) the link is
 * printed to the server console.
 */
export async function requestPasswordResetAction(
  _p: AccountState,
  fd: FormData,
): Promise<AccountState> {
  const t = await getErrorTranslator();
  const ip = await clientIp();
  if (!(await rateLimit(`reset:${ip}`, 5, 15 * 60 * 1000))) {
    return { error: t("tooManyRequests") };
  }

  const email = String(fd.get("email") || "").trim().toLowerCase();
  if (!email) return { error: t("enterEmail") };

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await signAccountToken(user, "reset", "1h");
    const url = resetUrl(token);
    if (features.email) {
      const tMail = await getTranslations("uiMigration.emails");
      await sendEmail({
        to: user.email,
        subject: tMail("resetSubject"),
        html: renderAccountActionHtml({
          heading: tMail("resetHeading"),
          body: tMail("resetBody", { name: user.name }),
          ctaLabel: tMail("resetCta"),
          ctaUrl: url,
          hint: tMail("resetHint"),
          fallbackLabel: tMail("fallbackLink"),
          footerLabel: tMail("sentVia"),
        }),
      });
    } else {
      // Dev without mail provider: surface the link in the server console.
      console.info(`[aera] Passwort-Reset-Link für ${user.email}: ${url}`);
    }
    await writeAudit({ actorUserId: user.id, action: "user.password_reset.request" });
  }

  // Identical response whether the account exists or not.
  return { ok: true };
}

/** Completes a password reset (or an invite) by setting a new password. */
async function setPasswordWithToken(
  purpose: "reset" | "invite",
  fd: FormData,
  t: ErrorT,
): Promise<AccountState | never> {
  const token = String(fd.get("token") || "");
  const password = String(fd.get("password") || "");
  const confirm = String(fd.get("confirm") || "");

  const pwError = validPassword(password, t);
  if (pwError) return { error: pwError };
  if (password !== confirm) return { error: t("passwordsDontMatch") };
  if (purpose === "invite" && fd.get("legalAcceptance") !== "on") {
    return { error: t("termsRequired") };
  }

  const user = await verifyAccountToken(token, purpose);
  if (!user) {
    return { error: t("linkInvalidOrExpired") };
  }

  const name = String(fd.get("name") || "").trim();
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      sessionVersion: { increment: 1 },
      // Both flows prove control of the mailbox (the link arrived there).
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      // Invites may set the display name (shadow accounts default to the
      // e-mail local part).
      ...(purpose === "invite" && name ? { name: name.slice(0, 80) } : {}),
      ...(purpose === "invite"
        ? {
            legalAcceptances: {
              create: [
                {
                  document: LEGAL_DOCUMENT.terms,
                  version: CURRENT_TERMS_VERSION,
                  source: "INVITE_ACCEPTANCE",
                },
                {
                  document: LEGAL_DOCUMENT.privacyNotice,
                  version: CURRENT_PRIVACY_VERSION,
                  source: "INVITE_ACCEPTANCE",
                },
              ],
            },
          }
        : {}),
    },
  });
  await setSessionCookie({
    userId: updatedUser.id,
    sessionVersion: updatedUser.sessionVersion,
  });
  await writeAudit({
    actorUserId: user.id,
    action: purpose === "invite" ? "user.invite.accept" : "user.password_reset.complete",
  });

  const next = String(fd.get("next") || "");
  const safe =
    next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
      ? next
      : "/dashboard";
  redirect(safe);
}

export async function resetPasswordAction(
  _p: AccountState,
  fd: FormData,
): Promise<AccountState> {
  return setPasswordWithToken("reset", fd, await getErrorTranslator());
}

// ------------------------------------------------- Member self-service
/** Update own profile (name + avatar) — used from the member account. */
export async function updateMemberProfileAction(
  _p: AccountState,
  fd: FormData,
): Promise<AccountState> {
  const t = await getErrorTranslator();
  const user = await getCurrentUser();
  if (!user) return { error: t("notLoggedIn") };

  const name = String(fd.get("name") ?? "").trim();
  if (name.length < 2) return { error: t("nameTooShort") };
  if (name.length > 60) return { error: t("nameTooLong") };

  const avatarRaw = fd.get("avatarUrl");
  const avatarUrl =
    avatarRaw === null ? undefined : String(avatarRaw).trim() || null;

  await prisma.user.update({
    where: { id: user.id },
    data: { name, ...(avatarUrl !== undefined ? { avatarUrl } : {}) },
  });
  await writeAudit({ actorUserId: user.id, action: "user.profile.update" });

  const path = String(fd.get("path") || "");
  if (path.startsWith("/") && !path.startsWith("//")) revalidatePath(path, "layout");
  return { ok: true };
}

/** Change own password — requires the current password. */
export async function changePasswordAction(
  _p: AccountState,
  fd: FormData,
): Promise<AccountState> {
  const t = await getErrorTranslator();
  const user = await getCurrentUser();
  if (!user) return { error: t("notLoggedIn") };

  const ip = await clientIp();
  if (!(await rateLimit(`pwchange:${ip}`, 5, 10 * 60 * 1000))) {
    return { error: t("tooManyAttempts") };
  }

  const current = String(fd.get("currentPassword") ?? "");
  const next = String(fd.get("newPassword") ?? "");
  const pwError = validPassword(next, t);
  if (pwError) return { error: pwError };

  const valid = await verifyPassword(current, user.passwordHash);
  if (!valid) return { error: t("currentPasswordWrong") };

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(next),
      sessionVersion: { increment: 1 },
    },
  });
  await setSessionCookie({
    userId: updatedUser.id,
    sessionVersion: updatedUser.sessionVersion,
  });
  await writeAudit({ actorUserId: user.id, action: "user.password.change" });
  return { ok: true };
}

export async function acceptInviteAction(
  _p: AccountState,
  fd: FormData,
): Promise<AccountState> {
  return setPasswordWithToken("invite", fd, await getErrorTranslator());
}

/** Records the current contract version without coupling it to marketing. */
export async function acceptCurrentLegalAction(
  _p: AccountState,
  fd: FormData,
): Promise<AccountState> {
  const t = await getErrorTranslator();
  const user = await getCurrentUser();
  if (!user) return { error: t("notLoggedIn") };
  if (fd.get("legalAcceptance") !== "on") {
    return { error: t("termsRequired") };
  }

  await systemPrisma.legalAcceptance.createMany({
    data: [
      {
        userId: user.id,
        document: LEGAL_DOCUMENT.terms,
        version: CURRENT_TERMS_VERSION,
        source: "VERSION_REVIEW",
      },
      {
        userId: user.id,
        document: LEGAL_DOCUMENT.privacyNotice,
        version: CURRENT_PRIVACY_VERSION,
        source: "VERSION_REVIEW",
      },
    ],
    skipDuplicates: true,
  });
  await writeAudit({ actorUserId: user.id, action: "user.legal.accept" });
  redirect(safeNextPath(fd.get("next")));
}

// ------------------------------------------------- Zwei-Faktor (TOTP)
export interface TotpState {
  error?: string;
  ok?: boolean;
  /** Einrichtungsdaten — nur direkt nach dem Start vorhanden. */
  secret?: string;
  otpauth?: string;
  qrDataUrl?: string;
  enabled?: boolean;
}

/** Startet die 2FA-Einrichtung: erzeugt Secret + QR-Code (noch nicht aktiv). */
export async function startTotpSetupAction(
  _p: TotpState,
  _fd: FormData,
): Promise<TotpState> {
  const t = await getErrorTranslator();
  const user = await getCurrentUser();
  if (!user) return { error: t("notLoggedIn") };
  if (user.totpEnabledAt) return { error: t("totpAlreadyEnabled") };

  const { generateTotpSecret, otpauthUrl } = await import("@/lib/totp");
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: encryptSecret(secret), totpEnabledAt: null },
  });

  const otpauth = otpauthUrl(secret, user.email);
  const { default: QRCode } = await import("qrcode");
  const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 220 });

  return { ok: true, secret, otpauth, qrDataUrl };
}

/** Aktiviert 2FA nach Bestätigung mit einem gültigen Code. */
export async function confirmTotpAction(
  _p: TotpState,
  fd: FormData,
): Promise<TotpState> {
  const t = await getErrorTranslator();
  const user = await getCurrentUser();
  if (!user) return { error: t("notLoggedIn") };
  if (!user.totpSecret) return { error: t("totpStartFirst") };
  if (user.totpEnabledAt) return { ok: true, enabled: true };

  const ip = await clientIp();
  if (!(await rateLimit(`totp:${user.id}:${ip}`, 10, 10 * 60 * 1000))) {
    return { error: t("tooManyAttempts") };
  }

  const { verifyTotp } = await import("@/lib/totp");
  const code = String(fd.get("code") || "");
  let totpSecret: string;
  try {
    totpSecret = decryptSecret(user.totpSecret);
  } catch {
    return { error: t("totpStartFirst") };
  }
  if (!verifyTotp(totpSecret, code)) {
    return { error: t("codeInvalidRetry") };
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      totpEnabledAt: new Date(),
      sessionVersion: { increment: 1 },
      ...(secretNeedsRotation(user.totpSecret)
        ? { totpSecret: encryptSecret(totpSecret) }
        : {}),
    },
  });
  await setSessionCookie({
    userId: updatedUser.id,
    sessionVersion: updatedUser.sessionVersion,
  });
  await writeAudit({ actorUserId: user.id, action: "user.totp.enable" });
  return { ok: true, enabled: true };
}

/** Deaktiviert 2FA — erfordert einen gültigen aktuellen Code. */
export async function disableTotpAction(
  _p: TotpState,
  fd: FormData,
): Promise<TotpState> {
  const t = await getErrorTranslator();
  const user = await getCurrentUser();
  if (!user) return { error: t("notLoggedIn") };
  if (!user.totpEnabledAt || !user.totpSecret) {
    return { ok: true, enabled: false };
  }

  const ip = await clientIp();
  if (!(await rateLimit(`totp:${user.id}:${ip}`, 10, 10 * 60 * 1000))) {
    return { error: t("tooManyAttempts") };
  }

  const { verifyTotp } = await import("@/lib/totp");
  const code = String(fd.get("code") || "");
  let totpSecret: string;
  try {
    totpSecret = decryptSecret(user.totpSecret);
  } catch {
    return { error: t("codeInvalid") };
  }
  if (!verifyTotp(totpSecret, code)) {
    return { error: t("codeInvalid") };
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      totpSecret: null,
      totpEnabledAt: null,
      sessionVersion: { increment: 1 },
    },
  });
  await setSessionCookie({
    userId: updatedUser.id,
    sessionVersion: updatedUser.sessionVersion,
  });
  await writeAudit({ actorUserId: user.id, action: "user.totp.disable" });
  return { ok: true, enabled: false };
}

/** Re-send the e-mail verification link for the logged-in account. */
export async function resendVerificationAction(
  _p: AccountState,
  _fd: FormData,
): Promise<AccountState> {
  const t = await getErrorTranslator();
  const user = await getCurrentUser();
  if (!user) return { error: t("notLoggedIn") };
  if (user.emailVerifiedAt) return { ok: true };

  const ip = await clientIp();
  if (!(await rateLimit(`verify:${user.id}:${ip}`, 3, 15 * 60 * 1000))) {
    return { error: t("tooManyRequests") };
  }

  const { sendVerificationEmail } = await import("@/lib/verification");
  try {
    await sendVerificationEmail(user);
  } catch {
    return { error: t("verificationSendFailed") };
  }
  await writeAudit({ actorUserId: user.id, action: "user.verification.resend" });
  return { ok: true };
}
