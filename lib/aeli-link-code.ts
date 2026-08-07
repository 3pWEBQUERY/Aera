import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Der Verbindungscode zwischen einer Aera-Community und einer Aeli-Seite.
 *
 * Gebraucht wird er nur für einen Fall — aber für den gibt es sonst keinen Weg:
 * Aera und Aeli teilen sich die `User`-Tabelle, wer also auf beiden Seiten
 * dasselbe Konto benutzt, verknüpft mit einem Klick. Wer seine Aeli-Seite
 * dagegen unter einer ANDEREN E-Mail angelegt hat, hat zwei getrennte
 * Identitäten — und keine von beiden darf allein entscheiden, dass sie
 * zusammengehören. Die Community-Seite stellt deshalb eine befristete Erlaubnis
 * aus, die Aeli-Seite löst sie ein.
 *
 * Der Code trägt seinen Inhalt selbst und braucht keine Tabelle: Tenant-ID und
 * Ablaufzeit, dazu eine Signatur mit `AELI_LINK_SECRET` — dasselbe Geheimnis in
 * beiden Apps. Ohne es lässt sich kein gültiger Code bauen, mit ihm keiner
 * fälschen.
 *
 * Was er bewusst NICHT kann: einmalig sein. Dafür bräuchte es einen
 * gespeicherten Zustand. Der Verzicht ist vertretbar, weil der Code nur eine
 * Sache erlaubt — dass eine Bio-Seite auf diese Community zeigt — die
 * Gültigkeit bei 30 Minuten endet und der Community-Besitzer jede Verknüpfung
 * jederzeit wieder lösen kann.
 */

const PREFIX = "AELI1";
const TTL_MS = 30 * 60_000;

function secret(): string {
  return (process.env.AELI_LINK_SECRET ?? "").trim();
}

export function linkCodesConfigured(): boolean {
  return secret().length >= 16;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 27);
}

/**
 * Erzeugt einen Code für diese Community. Zum Kopieren gedacht, nicht zum
 * Abtippen — die Tenant-ID steckt darin und ist allein schon 25 Zeichen lang.
 */
export function issueLinkCode(tenantId: string, now = Date.now()): string {
  const payload = `${tenantId}.${now + TTL_MS}`;
  return `${PREFIX}.${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload)}`;
}

export type LinkCodeResult =
  | { ok: true; tenantId: string }
  | { ok: false; reason: "malformed" | "invalid" | "expired" };

export function verifyLinkCode(code: string, now = Date.now()): LinkCodeResult {
  // Leerzeichen und Zeilenumbrüche kommen beim Kopieren fast immer mit.
  const parts = code.trim().replace(/\s+/g, "").split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, reason: "malformed" };

  const [, encoded, signature] = parts;
  let payload: string;
  try {
    payload = Buffer.from(encoded!, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const expected = sign(payload);
  const a = Buffer.from(signature!);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };

  const separator = payload.lastIndexOf(".");
  const tenantId = payload.slice(0, separator);
  const expiresAt = Number(payload.slice(separator + 1));
  if (!tenantId || !Number.isFinite(expiresAt)) return { ok: false, reason: "malformed" };
  // Die Ablaufprüfung kommt NACH der Signatur: sonst verriete die Antwort
  // etwas über einen Code, der gar nicht von uns stammt.
  if (expiresAt <= now) return { ok: false, reason: "expired" };

  return { ok: true, tenantId };
}
