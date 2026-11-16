import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isProduction = process.env.NODE_ENV === "production";
// The Content-Security-Policy is set per request with a nonce in proxy.ts
// (lib/csp.ts). Paths the proxy does not see (/_next/static, images) are
// static files that need none.

const nextConfig: NextConfig = {
  distDir: process.env.QA_DIST_DIR || ".next",
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
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
