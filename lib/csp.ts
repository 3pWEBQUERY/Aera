/**
 * Content-Security-Policy for every page response.
 *
 * Built per request in proxy.ts with a fresh nonce. Next reads the nonce from
 * the request's CSP header and puts it on its own bootstrap and streaming
 * scripts; with 'strict-dynamic' only those (and scripts they load) run, so
 * injected markup can no longer execute script even where HTML is rendered.
 * 'unsafe-inline' and the host list only matter to old CSP2 browsers — CSP3
 * browsers ignore both once a nonce and 'strict-dynamic' are present.
 *
 * Pure module: no server-only imports, safe for the proxy runtime.
 */

function storageOrigin(): string {
  try {
    return process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).origin : "";
  } catch {
    return "";
  }
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function contentSecurityPolicy(nonce: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  const storage = storageOrigin();
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    // WebRTC laeuft ueber fetch, nicht ueber ein iframe: Senden (WHIP) und
    // Zuschauen (WHEP) sprechen direkt mit Cloudflare Stream. Ohne diesen
    // Eintrag scheitert jeder Sendeversuch im Browser und in der App-Buehne
    // still an der CSP.
    `connect-src 'self' https://api.stripe.com https://*.stripe.com https://*.cloudflarestream.com wss:${storage ? ` ${storage}` : ""}`,
    // Stripe-Checkout + Live-Stream-Player (siehe lib/live-embed.ts). Neue
    // Streaming-Plattformen müssen hier freigegeben werden, sonst blockiert
    // die CSP das iframe ("Dieser Inhalt ist blockiert").
    [
      "frame-src 'self'",
      "https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
      "https://player.twitch.tv",
      "https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com",
      "https://player.kick.com https://kick.com",
      "https://player.vimeo.com",
      "https://chaturbate.com https://*.chaturbate.com https://cbxyz.com https://*.cbxyz.com",
      "https://www.tiktok.com https://tiktok.com",
      "https://www.instagram.com https://instagram.com",
    ].join(" "),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "frame-ancestors 'self'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
