"use server";

import { safeRelativePath } from "@/lib/safe-redirect";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { authenticate, homePathFor, registerUser } from "@/lib/auth";
import { clearSessionCookie } from "@/lib/session";
import { loginSchema, signupSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";
import { systemPrisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { getErrorTranslator, zodError } from "@/lib/action-errors";
import { hasCurrentLegalEvidence } from "@/lib/legal-evidence";

export interface AuthState {
  error?: string;
  /** Passwort korrekt, aber 2FA-Code erforderlich — Formular zeigt Code-Feld. */
  needsTotp?: boolean;
  /** Eingegebene E-Mail, damit das Formular sie nach einem Fehler behält.
   *  Das Passwort kommt bewusst nie zurück. */
  email?: string;
  /** Welches Feld der Fehler betrifft (für Fokus und aria-invalid). */
  errorField?: "credentials" | "code";
  /** Signup: eingegebener Name, bleibt nach einem Fehler stehen. */
  name?: string;
}

/**
 * Only same-site paths — "//evil.com" and "/\evil.com" are protocol-relative
 * external URLs in browsers and must never pass as a redirect target.
 */
function safeNext(next: FormDataEntryValue | null, fallback: string): string {
  return safeRelativePath(next, fallback);
}

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getErrorTranslator();
  // Name und E-Mail kommen nach einem Fehler zurück (defaultValue), das
  // Passwort nie.
  const kept = {
    name: String(formData.get("name") ?? "").slice(0, 80),
    email: String(formData.get("email") ?? "").trim().slice(0, 254),
  };
  const ip = await clientIp();
  if (!(await rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000))) {
    return { error: t("tooManySignups"), ...kept };
  }
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: zodError(t, parsed), ...kept };
  }
  if (formData.get("legalAcceptance") !== "on") {
    return { error: t("termsRequired"), ...kept };
  }
  const result = await registerUser({
    ...parsed.data,
    legalAcceptanceSource: "WEB_SIGNUP",
    // Sprache, in der die Person sich registriert hat — für spätere E-Mails.
    locale: await getLocale(),
  });
  if (!result.ok) return { error: t(result.error), ...kept };
  await writeAudit({ actorUserId: result.user.id, action: "user.signup" });
  // New accounts are plain members by default — creators opt in via /start.
  redirect(safeNext(formData.get("next"), "/home"));
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getErrorTranslator();
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  const ip = await clientIp();
  if (!(await rateLimit(`login:${ip}`, 10, 10 * 60 * 1000))) {
    return { error: t("tooManyLogins"), email };
  }
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: zodError(t, parsed), email, errorField: "credentials" };
  }
  const totp = String(formData.get("totp") || "").trim() || undefined;
  const recoveryCode = String(formData.get("recoveryCode") || "").trim().slice(0, 64) || undefined;
  const result = await authenticate(parsed.data.email, parsed.data.password, totp, {
    recoveryCode,
  });
  if (!result.ok)
    return {
      error: result.error ? t(result.error) : undefined,
      needsTotp: result.needsTotp,
      email,
      errorField: result.error
        ? result.needsTotp
          ? "code"
          : result.error === "invalidCredentials"
            ? "credentials"
            : undefined
        : undefined,
    };
  if (result.usedRecoveryCode) {
    await writeAudit({ actorUserId: result.user.id, action: "user.totp.recovery_code_used" });
  }
  // Ältere Konten haben noch keine Mail-Sprache: beim ersten Login die
  // aktuelle Anzeigesprache übernehmen. Eine bewusst gewählte bleibt.
  if (!result.user.locale) {
    await systemPrisma.user
      .updateMany({ where: { id: result.user.id, locale: null }, data: { locale: await getLocale() } })
      .catch(() => undefined);
  }
  // Mit einem Wiederherstellungscode angemeldet: Die App fehlt vermutlich.
  // Direkt zu den 2FA-Einstellungen, dort steht, wie viele Codes übrig sind.
  const destination = result.usedRecoveryCode
    ? "/member/account?tab=einstellungen&recovery=1#zwei-faktor"
    : safeNext(formData.get("next"), await homePathFor(result.user.id));
  if (!(await hasCurrentLegalEvidence(result.user.id))) {
    redirect(`/legal/accept?next=${encodeURIComponent(destination)}`);
  }
  redirect(destination);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/");
}
