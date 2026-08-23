import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display, Lora } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { buildPlatformMetadata } from "@/lib/seo";
import { UploadDock } from "@/components/ui/upload-dock";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Editorial serifs — used only inside blog articles (see .blog-article).
const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif-display",
});
const lora = Lora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif-body",
});

export async function generateMetadata(): Promise<Metadata> {
  // Titel, Beschreibung, OG/Twitter und robots kommen aus /admin/seo; die
  // App-spezifischen Teile (Manifest, Icons) bleiben hier fest verdrahtet.
  const platform = await buildPlatformMetadata();
  return {
    ...platform,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      // iOS "Add to Home Screen" uses this PNG (black background + logo).
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: "Aera",
      statusBarStyle: "black-translucent",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const t = await getTranslations("ui.frontend.accessibility");
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${playfair.variable} ${lora.variable}`}
    >
      <body>
        {/* Messages werden automatisch aus i18n/request.ts geerbt. */}
        <NextIntlClientProvider>
          <a className="skip-link" href="#main-content">
            {t("skipToContent")}
          </a>
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
          {/* Laufende Uploads, unten rechts — einmal fuer die ganze App. */}
          <UploadDock />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
