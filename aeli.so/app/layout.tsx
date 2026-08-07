import type { Metadata, Viewport } from "next";
import { env } from "@/lib/env";
import "./globals.css";

/**
 * Die Wurzel gilt für BEIDE Welten — App und öffentliche Bio-Seiten.
 *
 * Deshalb steht hier fast nichts: keine Navigation, keine Farbe, kein
 * Container. Die App-Hülle liegt in `(app)/layout.tsx`, die Bio-Seite bringt
 * ihre eigene mit. Eine gemeinsame Kopfzeile hier wäre auf jeder Profilseite
 * zu sehen — und das ist genau die Seite, auf der nichts von uns stehen soll.
 */

export const metadata: Metadata = {
  metadataBase: new URL(env.AELI_APP_URL),
  title: { default: "Aeli — eine Seite, alle Links", template: "%s · Aeli" },
  description:
    "Aeli bündelt alles, was du machst, auf einer Seite unter deinem eigenen Handle: Links, Musik, Termine, Newsletter — und den Weg in deine Community.",
  applicationName: "Aeli",
  openGraph: { siteName: "Aeli", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#08080b",
  // Zoom bleibt erlaubt. Eine Bio-Seite trägt oft kleine Schrift auf farbigem
  // Grund; wer sie vergrößern will, muss das können.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `data-scroll-behavior` sagt Next, dass das weiche Scrollen in
    // globals.css Absicht ist — sonst warnt es bei jedem Seitenwechsel.
    <html lang="de" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
