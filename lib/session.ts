import "server-only";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const COOKIE = "aera_sid";
/**
 * The pre-migration cookie. It was host-only, so a session started on
 * tenant.aera.so was invisible on the apex — which is why platform pages could
 * not simply redirect there. Still read (so nobody is logged out by the
 * switch) and always cleared on login/logout so it cannot outlive its
 * replacement.
 */
const LEGACY_COOKIE = "aera_session";
const secret = new TextEncoder().encode(env.AUTH_SECRET);

/**
 * Scope the session to `.aera.so` so every tenant subdomain shares one login
 * with the apex. A custom domain is a different registrable domain and
 * necessarily keeps its own session — browsers do not allow anything else.
 */
async function sessionCookieDomain(): Promise<string | undefined> {
  const root = env.ROOT_DOMAIN;
  // Local development runs on a bare host with no dot — a Domain attribute
  // there is invalid and browsers drop the cookie entirely.
  if (!root || root === "localhost" || !root.includes(".")) return undefined;
  const host = ((await headers()).get("host") ?? "")
    .split(":")[0]
    .toLowerCase();
  if (host === root || host.endsWith(`.${root}`)) return `.${root}`;
  return undefined;
}

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
  const token = store.get(COOKIE)?.value ?? store.get(LEGACY_COOKIE)?.value;
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
    domain: await sessionCookieDomain(),
    maxAge: 60 * 60 * 24 * 30,
  });
  // Retire the host-only predecessor in the same response. Next keys response
  // cookies by NAME, so this only works because the names differ — clearing a
  // second variant of the same name would silently overwrite the Set-Cookie
  // above and log the user straight back out.
  store.delete({ name: LEGACY_COOKIE, path: "/" });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  // Both names must go: a logout that leaves the legacy cookie behind would
  // keep the user signed in.
  store.delete({ name: COOKIE, path: "/", domain: await sessionCookieDomain() });
  store.delete({ name: LEGACY_COOKIE, path: "/" });
}
