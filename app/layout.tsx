import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display, Lora } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";

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
  const t = await getTranslations("uiMigration.auth");
  return {
    title: t("rootTitle"),
    description: t("rootDescription"),
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
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${playfair.variable} ${lora.variable}`}
    >
      <body>
        {/* Messages werden automatisch aus i18n/request.ts geerbt. */}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
