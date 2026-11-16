import "server-only";
import { env, features } from "./env";
import { contrastWithWhite, relativeLuminance, safeHexColor } from "./color";

const EMAIL_TIMEOUT_MS = 15_000;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

export interface SendResult {
  ok: boolean;
  id?: string;
  skipped?: boolean;
  error?: string;
}

/**
 * Send a transactional / campaign email through Resend's REST API.
 * When no RESEND_API_KEY is configured the message is logged and reported as
 * "skipped" so the rest of the flow (records, analytics) still works in dev.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  /** Textfassung. Fehlt sie, wird sie aus dem HTML abgeleitet. */
  text?: string;
  /**
   * Anzeigename des Absenders, z. B. der Community-Name. Ergibt
   * `"{senderName} via Aera" <noreply@…>`; die Adresse bleibt die der Plattform.
   */
  senderName?: string;
  /** Antwortadresse (z. B. Kontaktadresse des Creators). Ungültiges wird verworfen. */
  replyTo?: string | null;
  idempotencyKey?: string;
  /** Creator-authored bulk/lifecycle mail. Transactional is the safe default. */
  category?: "transactional" | "marketing";
  /** Mandatory for marketing; used for both RFC 2369 and RFC 8058 headers. */
  unsubscribeUrl?: string;
}): Promise<SendResult> {
  if (input.category === "marketing") {
    let unsubscribe: URL;
    try {
      unsubscribe = new URL(input.unsubscribeUrl ?? "");
    } catch {
      return { ok: false, error: "Marketing email requires a valid unsubscribe URL" };
    }
    if (
      unsubscribe.origin !== new URL(env.APP_URL).origin ||
      (process.env.NODE_ENV === "production" && unsubscribe.protocol !== "https:")
    ) {
      return { ok: false, error: "Marketing unsubscribe URL must use the configured app origin" };
    }
  }
  if (!features.email) {
    console.info(`[email:dev] -> ${input.to} :: ${input.subject}`);
    return { ok: true, skipped: true };
  }
  const replyTo = safeReplyTo(input.replyTo);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: input.senderName ? communitySender(input.senderName) : env.EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text ?? htmlToText(input.html),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(input.category === "marketing"
          ? {
              headers: {
                "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
              tags: [{ name: "category", value: "marketing" }],
            }
          : {}),
      }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, error: `Resend ${res.status}` };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- Absender

/** Adresse aus `Name <addr>` bzw. die nackte Adresse. */
export function senderAddress(from: string): string {
  const match = from.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  return (match?.[1] ?? from).trim();
}

/** Anzeigename aus `Name <addr>`, ohne Anführungszeichen; leer, wenn keiner da ist. */
function senderBrand(from: string): string {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*</);
  return match?.[1]?.trim() ?? "";
}

/**
 * Anzeigename für den From-Header ohne Header-Injection: Steuerzeichen und
 * Zeilenumbrüche werden zu Leerzeichen, `"`, `\`, `<` und `>` fallen weg
 * (manche Parser trennen naiv an `<`), dann wird der Rest in Anführungszeichen
 * gesetzt. Kommas und Semikolons sind innerhalb der Anführungszeichen harmlos.
 */
export function quoteDisplayName(name: string): string {
  const clean = name
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .replace(/["\\<>]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .trim();
  return clean ? `"${clean}"` : "";
}

/** `"{community} via Aera" <noreply@…>` — Adresse bleibt die der Plattform. */
export function communitySender(community: string, from: string = env.EMAIL_FROM): string {
  const brand = senderBrand(from) || "Aera";
  const display = quoteDisplayName(community) ? quoteDisplayName(`${community} via ${brand}`) : "";
  return display ? `${display} <${senderAddress(from)}>` : from;
}

function safeReplyTo(value: string | null | undefined): string | null {
  const address = value?.trim() ?? "";
  return address.length <= 254 && EMAIL_RE.test(address) ? address : null;
}

// ---------------------------------------------------------------- Textfassung

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * Textfassung aus dem Mail-HTML: Absätze bleiben Absätze, Links werden zu
 * „Text (URL)“. Reicht für unsere Vorlagen und für Creator-HTML als
 * Notlösung; Spamfilter und Text-Clients brauchen nur eine lesbare Fassung.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_, _q, href: string, inner: string) => {
      const label = decodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
      const url = decodeEntities(href).trim();
      if (!url || url.startsWith("#")) return label;
      return !label || label === url ? url : `${label} (${url})`;
    })
    .replace(/<img\b[^>]*?\balt\s*=\s*(["'])(.*?)\1[^>]*>/gi, (_, _q, alt: string) => alt)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote|section|article|header|footer)>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------- Gerüst

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/** Dunkle Schrift auf hellen Primärfarben (gleicher Ton wie die App). */
export const DARK_TEXT = "#161613";
/** Sekundärtext und Fußzeile auf Weiß: 7,6:1. */
const MUTED = "#4b5563";
/** Text außerhalb der Karte auf #f3f4f6: 9,3:1. */
export const OUTSIDE_TEXT = "#374151";

/**
 * Markiert die Stelle, an der appendUnsubscribeFooter die Abmelde-Fußzeile
 * einsetzt — innerhalb des Mail-Rahmens, damit Sprache und Region stimmen.
 */
export const FOOTER_SLOT = "<!--aera:footer-->";

/**
 * Schriftfarbe auf der Primärfarbe: Weiß, solange es mindestens 4,5:1
 * erreicht, sonst die Farbe mit dem höheren Kontrast (praktisch immer #161613).
 */
export function readableTextOn(background: string): "#ffffff" | typeof DARK_TEXT {
  const white = contrastWithWhite(background);
  if (white >= 4.5) return "#ffffff";
  const dark = (relativeLuminance(background) + 0.05) / (relativeLuminance(DARK_TEXT) + 0.05);
  return dark >= white ? DARK_TEXT : "#ffffff";
}

function htmlLang(locale: string | undefined): string {
  const tag = (locale ?? "de").trim();
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(tag) ? tag : "de";
}

function documentShell(args: { locale?: string; title: string; content: string }): string {
  const lang = htmlLang(args.locale);
  const title = escapeHtml(args.title);
  return `<!doctype html><html lang="${lang}" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${title}</title></head><body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:${FONT}">
  <div role="article" aria-roledescription="email" aria-label="${title}" lang="${lang}" dir="ltr" style="max-width:560px;margin:0 auto">
  ${args.content}
  ${FOOTER_SLOT}
  </div></body></html>`;
}

const CARD = "background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb";
const FOOTER = `padding:16px 24px;border-top:1px solid #e5e7eb;color:${MUTED};font-size:12px;line-height:1.5`;
const CTA = "display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px";

/** `<img>` ohne alt-Attribut bekommt `alt=""` (dekorativ), sonst bleibt alles, wie es ist. */
export function ensureImageAlt(html: string): string {
  return html.replace(
    /<img\b((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/gi,
    (whole, attrs: string, selfClose: string) =>
      /\salt(\s*=|\s|$)/i.test(attrs) ? whole : `<img${attrs} alt=""${selfClose ? " /" : ""}>`,
  );
}

export function renderCampaignHtml(args: {
  tenantName: string;
  primaryColor: string;
  subject: string;
  body: string;
  footerLabel?: string;
  bodyFormat?: "TEXT" | "HTML";
  /** Sprache des Empfängers (für `lang`). */
  locale?: string;
}): string {
  // HTML-Kampagnen werden so verwendet, wie der Code eingegeben wurde —
  // ohne Branding-Rahmen und ohne Escaping. Einzige Ergänzung: Bilder ohne
  // alt bekommen alt="", damit Screenreader keinen Dateinamen vorlesen.
  // Den Platzhalter der Abmelde-Fußzeile darf Creator-HTML nicht setzen
  // (sonst ließe sich der Link in verstecktes Markup verschieben).
  if (args.bodyFormat === "HTML") return ensureImageAlt(args.body.replaceAll(FOOTER_SLOT, ""));
  const paragraphs = args.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6;color:#1f2937">${escapeHtml(p)}</p>`)
    .join("");
  const background = safeHexColor(args.primaryColor, "#6d28d9");
  const color = readableTextOn(background);
  return documentShell({
    locale: args.locale,
    title: args.subject,
    content: `<div style="${CARD}">
    <div style="background:${background};padding:20px 24px;color:${color};font-weight:700;font-size:20px;line-height:1.3">${escapeHtml(args.tenantName)}</div>
    <div style="padding:24px 24px 8px">${paragraphs}</div>
    <div style="${FOOTER}">${escapeHtml(args.footerLabel ?? "Aera")}</div>
  </div>`,
  });
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fallbackLink(label: string, url: string): string {
  const href = escapeHtml(url);
  return `<p style="margin:16px 0 0">${escapeHtml(label)}<br/><a href="${href}" style="color:#1f2937;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere">${href}</a></p>`;
}

/** Simple transactional mail (invite / password reset) with one CTA button. */
export function renderAccountActionHtml(args: {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  hint: string;
  fallbackLabel: string;
  footerLabel: string;
  /** Sprache der Mail (für `lang`). */
  locale?: string;
  /** Betreff, landet im `<title>`. Standard: die Überschrift. */
  title?: string;
}): string {
  return documentShell({
    locale: args.locale,
    title: args.title ?? args.heading,
    content: `<div style="${CARD}">
    <h1 style="margin:0;padding:28px 24px 0;font-weight:700;font-size:20px;line-height:1.3;color:#0f172a">${escapeHtml(args.heading)}</h1>
    <p style="margin:0;padding:12px 24px 0;line-height:1.6;color:#1f2937">${escapeHtml(args.body)}</p>
    <div style="padding:24px">
      <a href="${escapeHtml(args.ctaUrl)}" style="${CTA}">${escapeHtml(args.ctaLabel)}</a>
    </div>
    <div style="padding:0 24px 24px;color:${MUTED};font-size:13px;line-height:1.5"><p style="margin:0">${escapeHtml(args.hint)}</p>${fallbackLink(args.fallbackLabel, args.ctaUrl)}</div>
    <div style="${FOOTER}">${escapeHtml(args.footerLabel)}</div>
  </div>`,
  });
}

/**
 * Support-Antwort. Eigener Renderer statt renderAccountActionHtml: hier ist
 * die Nachricht selbst der Inhalt, nicht ein Beiwerk zum Button — sie braucht
 * erhaltene Zeilenumbrueche und eine sichtbare Abgrenzung vom Rahmen.
 */
export function renderSupportHtml(args: {
  heading: string;
  intro: string;
  subjectLabel: string;
  subject: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  hint: string;
  footerLabel: string;
  /** Sprache der Mail (für `lang`). */
  locale?: string;
  /** Betreff der Mail, landet im `<title>`. Standard: die Überschrift. */
  title?: string;
}): string {
  // Erst escapen, dann Umbrueche zu <br> — nie umgekehrt, sonst waere das
  // <br> selbst wieder escaped bzw. Fremdtext koennte Markup einschleusen.
  const message = escapeHtml(args.message).replace(/\r?\n/g, "<br/>");
  return documentShell({
    locale: args.locale,
    title: args.title ?? args.heading,
    content: `<div style="${CARD}">
    <h1 style="margin:0;padding:28px 24px 0;font-weight:700;font-size:20px;line-height:1.3;color:#0f172a">${escapeHtml(args.heading)}</h1>
    <p style="margin:0;padding:12px 24px 0;line-height:1.6;color:#1f2937">${escapeHtml(args.intro)}</p>
    <p style="margin:0;padding:16px 24px 0;color:${MUTED};font-size:13px">${escapeHtml(args.subjectLabel)} <strong style="color:#0f172a">${escapeHtml(args.subject)}</strong></p>
    <div style="margin:12px 24px 0;padding:16px 18px;background:#f8fafc;border-left:3px solid #0f172a;border-radius:8px;line-height:1.6;color:#1f2937;overflow-wrap:anywhere">${message}</div>
    <div style="padding:24px">
      <a href="${escapeHtml(args.ctaUrl)}" style="${CTA}">${escapeHtml(args.ctaLabel)}</a>
    </div>
    <p style="margin:0;padding:0 24px 24px;color:${MUTED};font-size:13px;line-height:1.5">${escapeHtml(args.hint)}</p>
    <div style="${FOOTER}">${escapeHtml(args.footerLabel)}</div>
  </div>`,
  });
}
