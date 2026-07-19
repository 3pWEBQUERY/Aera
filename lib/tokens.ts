import "server-only";
import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { systemPrisma as prisma } from "./prisma";
import type { User } from "@/app/generated/prisma/client";

/**
 * Stateless single-use account tokens (invite / password reset).
 *
 * No token table needed: each token embeds a fingerprint of the user's
 * CURRENT password hash. Setting a new password changes the fingerprint and
 * instantly invalidates every previously issued token — i.e. effectively
 * single-use, and old reset mails can't take over an account later.
 */

const secret = new TextEncoder().encode(env.AUTH_SECRET);

export type AccountTokenPurpose = "invite" | "reset" | "verify";

function fingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

export async function signAccountToken(
  user: Pick<User, "id" | "passwordHash">,
  purpose: AccountTokenPurpose,
  expiresIn: string,
): Promise<string> {
  return await new SignJWT({
    sub: user.id,
    purpose,
    fp: fingerprint(user.passwordHash),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

/** Verifies signature, expiry, purpose and password fingerprint. */
export async function verifyAccountToken(
  token: string,
  purpose: AccountTokenPurpose,
): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.purpose !== purpose || typeof payload.sub !== "string") return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.accountStatus !== "ACTIVE") return null;
    if (payload.fp !== fingerprint(user.passwordHash)) return null; // already used
    return user;
  } catch {
    return null;
  }
}

export function inviteUrl(token: string): string {
  return `${env.APP_URL}/invite/${encodeURIComponent(token)}`;
}

export function resetUrl(token: string): string {
  return `${env.APP_URL}/reset/${encodeURIComponent(token)}`;
}

export function verifyUrl(token: string): string {
  return `${env.APP_URL}/verify/${encodeURIComponent(token)}`;
}
