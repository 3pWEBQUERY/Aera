import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isProduction = process.env.NODE_ENV === "production";
const storageOrigin = (() => {
  try {
    return process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).origin : "";
  } catch {
    return "";
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.stripe.com https://*.stripe.com wss:${storageOrigin ? ` ${storageOrigin}` : ""}`,
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
    "https://chaturbate.com https://*.chaturbate.com",
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

const nextConfig: NextConfig = {
  distDir: process.env.QA_DIST_DIR || ".next",
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(self), geolocation=(), payment=(self), usb=(), browsing-topics=()",
          },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  // This app also serves creator-owned custom domains. A
                  // global includeSubDomains/preload directive would make
                  // promises on behalf of domains Aera does not control.
                  value: "max-age=63072000",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
