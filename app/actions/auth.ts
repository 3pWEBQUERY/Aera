"use server";

import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { authenticate, registerUser } from "@/lib/auth";
import { clearSessionCookie } from "@/lib/session";
import { loginSchema, signupSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { getErrorTranslator, zodError } from "@/lib/action-errors";
import { hasCurrentLegalEvidence } from "@/lib/legal-evidence";

export interface AuthState {
  error?: string;
  /** Passwort korrekt, aber 2FA-Code erforderlich — Formular zeigt Code-Feld. */
  needsTotp?: boolean;
}

/**
 * Only same-site paths — "//evil.com" and "/\evil.com" are protocol-relative
 * external URLs in browsers and must never pass as a redirect target.
 */
function safeNext(next: FormDataEntryValue | null, fallback: string): string {
  const n = typeof next === "string" ? next : "";
  if (n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\")) return n;
  return fallback;
}

/** Creators (tenant owners / staff) land in the dashboard, members on Discover. */
async function homeFor(userId: string): Promise<string> {
  const [ownsTenant, staff] = await Promise.all([
    prisma.tenant.count({
      where: {
        ownerId: userId,
        status: "ACTIVE",
        memberships: {
          some: { userId, role: "OWNER", status: "ACTIVE" },
        },
      },
    }),
    prisma.membership.count({
      where: {
        userId,
        status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN", "MODERATOR"] },
        tenant: { status: "ACTIVE" },
      },
    }),
  ]);
  return ownsTenant > 0 || staff > 0 ? "/dashboard" : "/home";
}

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getErrorTranslator();
  const ip = await clientIp();
  if (!(await rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000))) {
    return { error: t("tooManySignups") };
  }
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: zodError(t, parsed) };
  }
  if (formData.get("legalAcceptance") !== "on") {
    return { error: t("termsRequired") };
  }
  const result = await registerUser({
    ...parsed.data,
    legalAcceptanceSource: "WEB_SIGNUP",
  });
  if (!result.ok) return { error: t(result.error) };
  await writeAudit({ actorUserId: result.user.id, action: "user.signup" });
  // New accounts are plain members by default — creators opt in via /start.
  redirect(safeNext(formData.get("next"), "/home"));
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getErrorTranslator();
  const ip = await clientIp();
  if (!(await rateLimit(`login:${ip}`, 10, 10 * 60 * 1000))) {
    return { error: t("tooManyLogins") };
  }
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: zodError(t, parsed) };
  }
  const totp = String(formData.get("totp") || "").trim() || undefined;
  const result = await authenticate(parsed.data.email, parsed.data.password, totp);
  if (!result.ok)
    return {
      error: result.error ? t(result.error) : undefined,
      needsTotp: result.needsTotp,
    };
  const destination = safeNext(formData.get("next"), await homeFor(result.user.id));
  if (!(await hasCurrentLegalEvidence(result.user.id))) {
    redirect(`/legal/accept?next=${encodeURIComponent(destination)}`);
  }
  redirect(destination);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/");
}
