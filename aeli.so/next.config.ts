import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const storageOrigin = (() => {
  try {
    return process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).origin : "";
  } catch {
    return "";
  }
})();

/**
 * Die Einbettungen sind der einzige Grund, warum diese Liste nicht kurz ist:
 * ein EMBED-Block rendert ein iframe des jeweiligen Anbieters, und ohne
 * Freigabe hier zeigt der Browser nur eine leere Flaeche. Neue Anbieter
 * gehoeren gleichzeitig hierher und in `EMBED_PROVIDERS` (lib/embed.ts) —
 * eine der beiden Stellen allein bringt nichts.
 */
const frameSrc = [
  "frame-src 'self'",
  "https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com",
  "https://open.spotify.com",
  "https://w.soundcloud.com",
  "https://player.vimeo.com",
  "https://embed.music.apple.com",
  "https://player.twitch.tv",
  "https://www.tiktok.com https://tiktok.com",
  "https://bandcamp.com https://*.bandcamp.com",
  "https://js.stripe.com https://checkout.stripe.com",
].join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  // Avatare und Bild-Bloecke duerfen auf beliebige https-Quellen zeigen; das
  // ist der Sinn einer Link-Seite. Kein `http:` — ein gemischter Inhalt wuerde
  // sonst still nicht laden.
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${storageOrigin ? ` ${storageOrigin}` : ""}`,
  frameSrc,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Bio-Seiten werden gern in fremde Seiten eingebettet — genau das soll hier
  // niemand koennen, weil ein unsichtbares iframe ueber einem echten Klickziel
  // die einfachste Art ist, Klicks auf fremde Links umzulenken.
  "frame-ancestors 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  /**
   * Ohne diese Zeile sucht Next die Projektwurzel, indem es nach oben läuft,
   * bis es eine Lockdatei findet — und findet dann Aeras `package-lock.json`
   * eine Ebene höher. Ab da hält es das Elternverzeichnis für das Projekt,
   * zieht dessen `instrumentation.ts` mit herein und löst `@/` gegen die
   * falsche Wurzel auf.
   *
   * Aeli liegt absichtlich im selben Repository wie Aera, aber es ist eine
   * eigene App. Hier steht, wo sie anfängt und aufhört.
   */
  turbopack: { root: import.meta.dirname },
  outputFileTracingRoot: import.meta.dirname,

  // Pakete mit nativen Bindings (Postgres-Treiber, libvips hinter sharp)
  // gehören nicht ins Bundle — sie werden zur Laufzeit aus node_modules
  // geladen.
  serverExternalPackages: ["@prisma/adapter-pg", "pg", "sharp"],
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Bio-Seiten sind Weiterleitungsflaechen. Das Ziel soll erfahren,
          // dass der Klick von aeli.so kam (dafuer zahlt der Creator mit
          // seiner Reichweite), aber nicht, von welchem Handle — der Pfad
          // bleibt drin, weil er auf Subdomains ohnehin nur "/" ist.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
          },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  // includeSubDomains ist hier korrekt und wichtig: JEDE
                  // Subdomain von aeli.so ist eine von uns ausgelieferte
                  // Profilseite, es gibt keine fremden Hosts darunter.
                  value: "max-age=63072000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
