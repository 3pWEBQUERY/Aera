import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const COOKIE = "aera_session";
const secret = new TextEncoder().encode(env.AUTH_SECRET);

/**
 * Session tokens carry the user id plus a revocation version. Profile data is
 * still loaded fresh from the database on every request.
 */
export interface SessionPayload {
  userId: string;
  sessionVersion: number;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({
    userId: payload.userId,
    sessionVersion: payload.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.userId !== "string" || !payload.userId) return null;
    // Legacy tokens map to version 0, preserving existing sessions until the
    // first security-sensitive account change.
    const sessionVersion =
      typeof payload.sessionVersion === "number" &&
      Number.isSafeInteger(payload.sessionVersion) &&
      payload.sessionVersion >= 0
        ? payload.sessionVersion
        : 0;
    return { userId: payload.userId, sessionVersion };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
