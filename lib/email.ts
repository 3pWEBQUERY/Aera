import "server-only";
import { env, features } from "./env";

const EMAIL_TIMEOUT_MS = 15_000;

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
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
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

export function renderCampaignHtml(args: {
  tenantName: string;
  primaryColor: string;
  subject: string;
  body: string;
  footerLabel?: string;
  bodyFormat?: "TEXT" | "HTML";
}): string {
  // HTML-Kampagnen werden exakt so verwendet, wie der Code eingegeben wurde —
  // ohne Branding-Rahmen, ohne Escaping, ohne Absatz-Aufteilung.
  if (args.bodyFormat === "HTML") return args.body;
  const paragraphs = args.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6;color:#1f2937">${escapeHtml(p)}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:${args.primaryColor};padding:20px 24px;color:#fff;font-weight:700;font-size:18px">${escapeHtml(args.tenantName)}</div>
    <div style="padding:24px">${paragraphs}</div>
    <div style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">${escapeHtml(args.footerLabel ?? "Aera")}</div>
  </div></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
}): string {
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="padding:28px 24px 0;font-weight:700;font-size:20px;color:#0f172a">${escapeHtml(args.heading)}</div>
    <div style="padding:12px 24px 0;line-height:1.6;color:#1f2937">${escapeHtml(args.body)}</div>
    <div style="padding:24px">
      <a href="${escapeHtml(args.ctaUrl)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px">${escapeHtml(args.ctaLabel)}</a>
    </div>
    <div style="padding:0 24px 24px;color:#6b7280;font-size:13px;line-height:1.5">${escapeHtml(args.hint)}<br/><br/>${escapeHtml(args.fallbackLabel)} ${escapeHtml(args.ctaUrl)}</div>
    <div style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">${escapeHtml(args.footerLabel)}</div>
  </div></body></html>`;
}
