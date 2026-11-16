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

async function requestHost(): Promise<string> {
  return ((await headers()).get("host") ?? "").split(":")[0].toLowerCase();
}

function isPlatformHost(host: string): boolean {
  const root = env.ROOT_DOMAIN;
  if (!root || !root.includes(".")) return true;
  return host === root || host.endsWith(`.${root}`);
}

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
  return isPlatformHost(await requestHost()) ? `.${root}` : undefined;
}

/**
 * Audience a session token is valid for. Tokens minted on the platform
 * (apex, tenant subdomains, mobile API) carry PLATFORM_AUDIENCE. A creator's
 * custom domain is controlled by the creator (their DNS, possibly their own
 * CDN/proxy in front), so a cookie set there could be read by them — it must
 * never be replayable on aera.so. Such tokens are bound to exactly that host.
 */
export const PLATFORM_AUDIENCE = "aera";

export function sessionAudienceForHost(host: string): string {
  const normalized = host.split(":")[0].toLowerCase();
  return isPlatformHost(normalized) ? PLATFORM_AUDIENCE : `custom:${normalized}`;
}

async function currentAudience(): Promise<string> {
  return sessionAudienceForHost(await requestHost());
}

/**
 * Session tokens carry the user id plus a revocation version. Profile data is
 * still loaded fresh from the database on every request.
 */
export interface SessionPayload {
  userId: string;
  sessionVersion: number;
}

export async function signSession(
  payload: SessionPayload,
  audience: string = PLATFORM_AUDIENCE,
): Promise<string> {
  return await new SignJWT({
    userId: payload.userId,
    sessionVersion: payload.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifySession(
  token: string,
  audience: string = PLATFORM_AUDIENCE,
): Promise<SessionPayload | null> {
  try {
    // Tokens without an audience predate host binding and are rejected: one
    // minted on a custom domain could otherwise be replayed on the platform.
    const { payload } = await jwtVerify(token, secret, {
      audience,
      algorithms: ["HS256"],
    });
    if (typeof payload.userId !== "string" || !payload.userId) return null;
    // Tokens without a version map to 0 until the first security-sensitive
    // account change.
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
  return verifySession(token, await currentAudience());
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload, await currentAudience());
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
