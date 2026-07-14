import "server-only";
import { cache } from "react";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { getSession, setSessionCookie } from "./session";
import type { SessionPayload } from "./session";
import { sendVerificationEmail } from "./verification";
import type { User } from "@/app/generated/prisma/client";

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
  | { ok: true; user: User }
  | { ok: false; error?: string; needsTotp?: boolean };

export async function authenticate(
  email: string,
  password: string,
  totp?: string,
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user) return { ok: false, error: "invalidCredentials" };
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false, error: "invalidCredentials" };

  // Zwei-Faktor: erst nach korrektem Passwort abfragen (kein User-Enum-Leak).
  if (user.totpEnabledAt && user.totpSecret) {
    if (!totp) return { ok: false, needsTotp: true };
    const { verifyTotp } = await import("./totp");
    if (!verifyTotp(user.totpSecret, totp)) {
      return { ok: false, needsTotp: true, error: "totpCodeInvalid" };
    }
  }

  await setSessionCookie({ userId: user.id, sessionVersion: user.sessionVersion });
  return { ok: true, user };
}

/** Request-deduped: layout + page share one DB lookup per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  return user && sessionMatchesUser(session, user) ? user : null;
});

export function sessionMatchesUser(
  session: SessionPayload,
  user: Pick<User, "id" | "sessionVersion">,
): boolean {
  return session.userId === user.id && session.sessionVersion === user.sessionVersion;
}
