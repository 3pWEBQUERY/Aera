import "server-only";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { systemPrisma as prisma } from "./prisma";
import { getSession, setSessionCookie } from "./session";
import type { SessionPayload } from "./session";
import { sendVerificationEmail } from "./verification";
import { rateLimit } from "./rate-limit";
import {
  decryptSecret,
  encryptSecret,
  secretNeedsRotation,
} from "./secret-encryption";
import type { User } from "@/app/generated/prisma/client";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  LEGAL_DOCUMENT,
} from "./legal";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
  legalAcceptanceSource: "WEB_SIGNUP" | "COMMUNITY_SIGNUP" | "MOBILE_SIGNUP";
  /** Sprache für E-Mails (Web: Request-Sprache, Mobile: Body/Accept-Language). */
  locale?: string | null;
}): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  let user: User;
  try {
    // Single atomic create — the unique constraint handles double-submits.
    user = await prisma.user.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash: await hashPassword(input.password),
        locale: input.locale ?? null,
        legalAcceptances: {
          create: [
            {
              document: LEGAL_DOCUMENT.terms,
              version: CURRENT_TERMS_VERSION,
              source: input.legalAcceptanceSource,
            },
            {
              document: LEGAL_DOCUMENT.privacyNotice,
              version: CURRENT_PRIVACY_VERSION,
              source: input.legalAcceptanceSource,
            },
          ],
        },
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      // Key aus dem `errors`-Namespace — die aufrufende Action übersetzt.
      return { ok: false, error: "emailAlreadyRegistered" };
    }
    throw e;
  }
  await setSessionCookie({ userId: user.id, sessionVersion: user.sessionVersion });
  // Best effort: signup must never fail because the mail provider hiccups.
  try {
    await sendVerificationEmail(user);
  } catch (e) {
    console.error(`Verification mail failed for ${user.email}:`, e);
  }
  return { ok: true, user };
}

export type AuthResult =
  | { ok: true; user: User; usedRecoveryCode?: boolean }
  | { ok: false; error?: string; needsTotp?: boolean };

export async function authenticate(
  email: string,
  password: string,
  totp?: string,
  options: { recoveryCode?: string } = {},
): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  // Per-account budget on top of the per-IP limit in the callers: rotating
  // IPs must not allow unlimited password or TOTP guesses against one
  // account (10 attempts per 15 minutes keeps a 6-digit code out of reach).
  if (!(await rateLimit(`login:account:${normalizedEmail}`, 10, 15 * 60 * 1000))) {
    return { ok: false, error: "tooManyLogins" };
  }
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (!user || user.accountStatus !== "ACTIVE") {
    return { ok: false, error: "invalidCredentials" };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false, error: "invalidCredentials" };

  // Zwei-Faktor: erst nach korrektem Passwort abfragen (kein User-Enum-Leak).
  let usedRecoveryCode = false;
  if (user.totpEnabledAt && user.totpSecret) {
    const recoveryCode = options.recoveryCode?.trim();
    if (recoveryCode) {
      // Ersatz für den App-Code; verbraucht den Code (genau einmal gültig).
      // Das Budget oben zählt auch diese Versuche.
      const { consumeRecoveryCode } = await import("./totp-recovery");
      if (!(await consumeRecoveryCode(user.id, recoveryCode))) {
        return { ok: false, needsTotp: true, error: "recoveryCodeInvalid" };
      }
      usedRecoveryCode = true;
    }
  }
  if (user.totpEnabledAt && user.totpSecret && !usedRecoveryCode) {
    if (!totp) return { ok: false, needsTotp: true };
    const { verifyTotp } = await import("./totp");
    let totpSecret: string;
    try {
      totpSecret = decryptSecret(user.totpSecret);
    } catch (error) {
      console.error(`TOTP secret could not be decrypted for user ${user.id}:`, error);
      return { ok: false, error: "invalidCredentials" };
    }
    if (!verifyTotp(totpSecret, totp)) {
      return { ok: false, needsTotp: true, error: "totpCodeInvalid" };
    }
    if (secretNeedsRotation(user.totpSecret)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { totpSecret: encryptSecret(totpSecret) },
      });
    }
  }

  await setSessionCookie({ userId: user.id, sessionVersion: user.sessionVersion });
  return { ok: true, user, ...(usedRecoveryCode ? { usedRecoveryCode } : {}) };
}

/**
 * Startseite nach Anmeldung oder Passwort-Reset: Creator (Besitzer oder Team
 * einer aktiven Community) ins Dashboard, alle anderen nach /home. Mitglieder
 * dürfen nie in /dashboard landen — dort beginnt der Creator-Wizard.
 */
export async function homePathFor(userId: string): Promise<string> {
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

/** Request-deduped: layout + page share one DB lookup per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  return user && user.accountStatus === "ACTIVE" && sessionMatchesUser(session, user)
    ? user
    : null;
});

export function sessionMatchesUser(
  session: SessionPayload,
  user: Pick<User, "id" | "sessionVersion">,
): boolean {
  return session.userId === user.id && session.sessionVersion === user.sessionVersion;
}
