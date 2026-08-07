import "server-only";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

/**
 * Eigener Name, eigenes Geheimnis, eigene Domain. Ein Aera-Cookie ist auf
 * `.aera.so` gebunden und kommt hier ohnehin nie an; der getrennte Name
 * verhindert zusaetzlich, dass ein gemeinsames Elterndomain-Setup in der
 * Entwicklung die beiden Sitzungen verwechselt.
 */
const COOKIE = "aeli_sid";
const secret = new TextEncoder().encode(env.AELI_AUTH_SECRET);

/**
 * Auf `.aeli.so` scopen, damit die Sitzung auf dem Apex UND auf jeder
 * Profil-Subdomain gilt — die Vorschau-Leiste („Du bearbeitest gerade diese
 * Seite“) auf `{handle}.aeli.so` haengt daran.
 */
async function cookieDomain(): Promise<string | undefined> {
  const root = env.AELI_ROOT_DOMAIN;
  // Lokal laeuft alles auf `localhost` — ein Domain-Attribut ohne Punkt ist
  // ungueltig, der Browser verwirft das Cookie dann komplett.
  if (!root || root === "localhost" || !root.includes(".")) return undefined;
  const host = ((await headers()).get("host") ?? "").split(":")[0].toLowerCase();
  if (host === root || host.endsWith(`.${root}`)) return `.${root}`;
  return undefined;
}

export interface SessionPayload {
  userId: string;
  /** Spiegelt `User.sessionVersion`; ein Hochzaehlen entwertet alte Tokens. */
  sessionVersion: number;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ userId: payload.userId, sessionVersion: payload.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.userId !== "string" || !payload.userId) return null;
    const version = payload.sessionVersion;
    return {
      userId: payload.userId,
      sessionVersion:
        typeof version === "number" && Number.isSafeInteger(version) && version >= 0 ? version : 0,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? verifySession(token) : null;
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, await signSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    domain: await cookieDomain(),
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete({ name: COOKIE, path: "/", domain: await cookieDomain() });
}
