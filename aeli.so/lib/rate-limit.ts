import "server-only";

/**
 * Ein Zähler im Prozessspeicher.
 *
 * Bewusst kein Redis: Aeli läuft als eine Instanz, und ein zweiter Dienst nur
 * für „wie oft hat diese IP gerade das Passwort geraten“ wäre mehr Betrieb als
 * Schutz. Die Grenze ist real — bei mehreren Instanzen zählt jede für sich,
 * die effektive Rate ist also n-mal so hoch. Sobald Aeli horizontal skaliert,
 * gehört das hinter denselben Redis, den Aera schon betreibt.
 *
 * Was es trotzdem leistet: es macht das Durchprobieren von Passwörtern und das
 * Zumüllen der Ereignistabelle unattraktiv, und das ist der Punkt.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 20_000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Falls fast alles noch gültig ist, hilft das Aufräumen nicht — dann fliegen
  // die ältesten Einträge raus. Eine unbegrenzte Map wäre der eigentliche
  // Angriffspunkt: viele verschiedene Schlüssel statt vieler Versuche.
  while (buckets.size >= MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Sekunden bis zum nächsten erlaubten Versuch (0, wenn erlaubt). */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size >= MAX_KEYS) sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Die IP des Anfragenden hinter dem Proxy. Nur für Ratenbegrenzung — sie wird
 * nirgends gespeichert und verlässt diesen Prozess nicht.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unbekannt";
}
